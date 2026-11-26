import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import type { ReaderView } from "./reader-model";

const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
/** A prose-only sidebar view. Never renders a second source editor or file tree. */
export class NativeDetails implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private snapshot?: ReaderView;
  private answer?: { id: string; revision: string; text: string };
  private message = "";
  constructor(
    private action: (type: string, payload: any) => Promise<unknown>,
  ) {}
  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.onDidReceiveMessage(async (message) => {
      if (
        !["explain", "navigate", "settings", "test", "clear"].includes(
          message?.type,
        )
      )
        return;
      try {
        await this.action(message.type, message);
      } catch (error) {
        this.setMessage(String(error));
      }
    });
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
    this.render();
  }
  update(snapshot?: ReaderView) {
    this.snapshot = snapshot;
    this.message = "";
    this.render();
  }
  setMessage(message: string) {
    this.message = message;
    this.render();
  }
  setAnswer(id: string, revision: string, text: string) {
    this.answer = { id, revision, text };
    this.message = "";
    this.render();
  }
  private render() {
    if (!this.view) return;
    const nonce = randomBytes(18).toString("hex"),
      view = this.snapshot,
      node = view?.selected;
    const button = (label: string, action: string, attrs = "") =>
      `<button data-action="${action}" ${attrs}>${label}</button>`;
    const evidence = (line: number) =>
      button(`L${line}`, "navigate", `data-line="${line}" class="evidence"`);
    const answer =
      this.answer &&
      this.answer.id === node?.id &&
      this.answer.revision === view?.revision
        ? this.answer.text
        : undefined;
    const parameters = node?.parameterDetails
      ?.map(
        (parameter) =>
          `<article><h3>${escape(parameter.name)} <small>${parameter.optional ? "可选" : ""}</small></h3><code>${escape(parameter.type)}</code><p>${escape(parameter.description)}</p>${parameter.defaultValue !== undefined ? `<p class="muted">默认值：${escape(parameter.defaultValue)}</p>` : ""}<div>${evidence(parameter.line)} ${parameter.uses
            .slice(0, 8)
            .map((use) => evidence(use.line))
            .join(" ")}</div></article>`,
      )
      .join("");
    this.view.webview.html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">
      body{margin:0;padding:14px 16px 24px;color:var(--vscode-foreground);font:var(--vscode-font-size)/1.6 var(--vscode-font-family);background:var(--vscode-sideBar-background)}h2{font-size:15px;line-height:1.4;margin:6px 0;overflow-wrap:anywhere}h3{font-size:12px;margin:0 0 4px}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.muted,small{color:var(--vscode-descriptionForeground)}code{font-family:var(--vscode-editor-font-family);font-size:12px;overflow-wrap:anywhere}.toolbar{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}button{font:inherit;border:1px solid var(--vscode-button-border,transparent);border-radius:3px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);padding:4px 9px;cursor:pointer}button:hover{background:var(--vscode-button-secondaryHoverBackground)}button:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:2px}.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}.primary:hover{background:var(--vscode-button-hoverBackground)}.evidence{padding:1px 5px;font-size:11px;margin:2px 2px 0 0;color:var(--vscode-textLink-foreground);background:transparent}section{border-top:1px solid var(--vscode-widget-border, var(--vscode-panel-border));padding-top:12px;margin-top:14px}article{margin:12px 0;padding-left:10px;border-left:2px solid var(--vscode-panel-border)}.notice{color:var(--vscode-descriptionForeground);border-left:2px solid var(--vscode-textLink-foreground);padding-left:9px}.answer{white-space:pre-wrap}details{margin-top:12px}summary{cursor:pointer;color:var(--vscode-descriptionForeground)}
      </style></head><body>${
        node
          ? `<small>${escape(node.language ?? "")} · ${escape(view!.file?.path.split("/").at(-1))} · L${node.line}–${node.endLine}</small><h2>${escape(node.name)}</h2><p>${escape(node.summary)}</p><div class="toolbar">${button("解释此函数", "explain", 'class="primary"')}${button("定位源码", "navigate", `data-line="${node.line}"`)}</div>${node.documentation ? `<p>${escape(node.documentation)}</p>` : ""}${answer ? `<section><h3>AI 解读 · 请核对源码</h3><p class="answer">${escape(answer)}</p></section>` : ""}${parameters ? `<section><h3>参数与源码证据</h3>${parameters}</section>` : ""}${
              view!.unresolved.length
                ? `<details><summary>外部 / 未解析关系（${view!.unresolved.length}）</summary>${view!.unresolved
                    .slice(0, 20)
                    .map(
                      (item) =>
                        `<p>${escape(item.label)} ${evidence(item.line)}</p>`,
                    )
                    .join("")}</details>`
                : ""
            }`
          : `<h2>在编辑器中阅读</h2><p class="muted">打开项目源码，将光标移到函数中。逻辑导航和参数说明会跟随当前函数；文件、搜索和标签沿用 VS Code。</p>`
      }
      ${this.message ? `<p role="status" class="notice">${escape(this.message)}</p>` : ""}<section><div class="toolbar">${button("模型设置", "settings")}${button("测试连接", "test")}${button("清除配置", "clear")}</div><small>基础阅读无需 Key。模型解释将发送有限源码到你配置的 API。</small></section>
      <script nonce="${nonce}">const vscode=acquireVsCodeApi();document.addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(button)vscode.postMessage({type:button.dataset.action,id:${JSON.stringify(node?.id ?? "").replace(/</g, "\\u003c")},revision:${JSON.stringify(view?.revision ?? "")},line:Number(button.dataset.line)||undefined});});</script></body></html>`;
  }
}
