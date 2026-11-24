import * as vscode from "vscode";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { CodeMap } from "./model";
import { readerView } from "./reader-model";
import { ModelService } from "./model-service";

const supported = /\.[cm]?[jt]sx?$/i;
const normalize = (p: string) => path.resolve(p).replace(/\\/g, "/");
export function activate(context: vscode.ExtensionContext) {
  const model = new ModelService({
    read: async () => {
      const raw = await context.secrets.get("scanf.model");
      return raw ? JSON.parse(raw) : undefined;
    },
    write: async (config) => {
      if (config)
        await context.secrets.store("scanf.model", JSON.stringify(config));
      else await context.secrets.delete("scanf.model");
    },
  });
  let panel: vscode.WebviewPanel | undefined;
  let map: CodeMap | undefined;
  let sources: Record<string, string> = {},
    sourceRevision = "",
    selectedId: string | undefined;
  let root: vscode.WorkspaceFolder | undefined;
  let worker: Worker | undefined;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const post = (message: unknown) => panel?.webview.postMessage(message);
  const modelSnapshot = (id: string, version: string) => {
    if (
      !map ||
      version !== sourceRevision ||
      !map.nodes.some((n) => n.id === id)
    )
      throw new Error("源码版本已变化，请刷新。");
    return readerView(map, sources, sourceRevision, id);
  };
  const modelAction = (
    operation: string,
    payload: any = {},
    signal?: AbortSignal,
  ) => model.action(operation, payload, modelSnapshot, signal);
  const sendView = (selection = false, requestId?: number) => {
    if (map)
      post({
        type: "view",
        view: readerView(map, sources, sourceRevision, selectedId),
        selection,
        requestId,
      });
  };
  const selection = () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !map) return;
    const file = normalize(editor.document.uri.fsPath),
      line = editor.selection.active.line + 1;
    const selected = map.nodes
      .filter(
        (n) =>
          n.file === file &&
          n.kind === "function" &&
          n.line <= line &&
          n.endLine >= line,
      )
      .sort((a, b) => a.endLine - a.line - (b.endLine - b.line))[0];
    const id = selected?.id ?? map.nodes.find((n) => n.file === file)?.id;
    if (id && id !== selectedId) {
      selectedId = id;
      sendView(true);
    }
  };
  const refresh = async (requestId?: number) => {
    if (!panel || !root) return;
    const current = ++revision;
    await worker?.terminate();
    worker = undefined;
    post({ type: "busy" });
    try {
      const configured = vscode.workspace
        .getConfiguration("scanf", root.uri)
        .get<number>("maxFiles", 150);
      const limit = Math.max(
        1,
        Math.min(
          500,
          Math.floor(Number.isFinite(configured) ? configured : 150),
        ),
      );
      const exclude =
        "**/{node_modules,.git,dist,build,coverage,.next,out,vendor}/**";
      const candidates = await vscode.workspace.findFiles(
        new vscode.RelativePattern(
          root,
          "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
        ),
        exclude,
        limit + 1,
      );
      const warnings: string[] = [];
      if (candidates.length > limit)
        warnings.push(
          `文件数超过 ${limit}，只显示部分文件。请缩小到功能目录或调整 scanf.maxFiles。`,
        );
      const active = vscode.window.activeTextEditor?.document;
      let uris = candidates.slice(0, limit);
      if (
        active &&
        supported.test(active.uri.fsPath) &&
        vscode.workspace.getWorkspaceFolder(active.uri)?.uri.toString() ===
          root.uri.toString() &&
        !uris.some((u) => u.toString() === active.uri.toString())
      )
        uris = [active.uri, ...uris].slice(0, limit);
      const files: Record<string, string> = {};
      let bytes = 0;
      for (const uri of uris) {
        try {
          const open = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === uri.toString(),
          );
          const text = open
            ? open.getText()
            : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString(
                "utf8",
              );
          const size = Buffer.byteLength(text);
          if (size > 256 * 1024 || bytes + size > 8 * 1024 * 1024) {
            warnings.push(
              `体积限制，跳过 ${vscode.workspace.asRelativePath(uri)}`,
            );
            continue;
          }
          files[normalize(uri.fsPath)] = text;
          bytes += size;
        } catch {
          warnings.push(`无法读取 ${vscode.workspace.asRelativePath(uri)}`);
        }
      }
      if (current !== revision || !panel) return;
      const running = new Worker(context.asAbsolutePath("dist/worker.js"), {
        workerData: { files, root: root.uri.fsPath },
      });
      worker = running;
      let completed = false;
      running.once("message", (message: { map?: CodeMap; error?: string }) => {
        completed = true;
        if (current !== revision || !panel) return;
        if (message.error || !message.map) {
          post({
            type: "error",
            message: message.error ?? "分析失败",
            error: message.error ?? "分析失败",
            requestId,
          });
          return;
        }
        map = message.map;
        map.warnings.unshift(...warnings);
        sources = files;
        sourceRevision = createHash("sha256")
          .update(JSON.stringify(files))
          .digest("hex")
          .slice(0, 20);
        if (!map.nodes.some((n) => n.id === selectedId)) selectedId = undefined;
        sendView(false, requestId);
        selection();
      });
      running.once("error", (error) => {
        if (current === revision)
          post({
            type: "error",
            message: error.message,
            error: error.message,
            requestId,
          });
      });
      running.once("exit", (code) => {
        if (!completed && code !== 0 && current === revision)
          post({ type: "error", message: `分析进程退出 (${code})` });
        if (worker === running) worker = undefined;
      });
    } catch (error) {
      if (current === revision)
        post({
          type: "error",
          message: String(error),
          error: String(error),
          requestId,
        });
    }
  };
  const schedule = () => {
    if (!panel) return;
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 650);
  };
  const open = async () => {
    const editor = vscode.window.activeTextEditor;
    const chosen =
      (editor && vscode.workspace.getWorkspaceFolder(editor.document.uri)) ??
      vscode.workspace.workspaceFolders?.[0];
    if (!chosen || chosen.uri.scheme !== "file") {
      vscode.window.showInformationMessage(
        "请先打开本地 TypeScript / JavaScript 项目文件夹。",
      );
      return;
    }
    const changed = root?.uri.toString() !== chosen.uri.toString();
    root = chosen;
    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside, true);
      if (changed) await refresh();
      else selection();
      return;
    }
    panel = vscode.window.createWebviewPanel(
      "scanf.reader",
      "Scanf · 代码阅读地图",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "media"),
          vscode.Uri.joinPath(context.extensionUri, "dist"),
        ],
        retainContextWhenHidden: true,
      },
    );
    const nonce = randomBytes(18).toString("hex");
    const script = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "dist", "reader.js"),
    );
    const css = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "media", "reader.css"),
    );
    panel.webview.html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="scanf-nonce" content="${nonce}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${css}"><title>Scanf</title></head><body><div id="app"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message?.type === "model") {
          try {
            post({
              requestId: message.requestId,
              result: await modelAction(message.operation, message.payload),
            });
          } catch (error) {
            post({ requestId: message.requestId, error: String(error) });
          }
          return;
        }
        if (message?.type === "expand") {
          panel?.reveal(vscode.ViewColumn.Active);
          post({ requestId: message.requestId, result: { expanded: true } });
          return;
        }
        if (message?.type === "ready" || message?.type === "refresh") {
          await refresh(message.requestId);
          return;
        }
        if (message?.type === "inspect" && map) {
          if (
            message.revision !== sourceRevision ||
            !map.nodes.some((n) => n.id === message.id)
          ) {
            post({
              requestId: message.requestId,
              error: "源码版本已变化或符号已失效，请刷新。",
            });
            return;
          }
          selectedId = message.id;
          sendView(false, message.requestId);
          return;
        }
        if (
          message?.type === "navigate" &&
          map &&
          typeof message.id === "string"
        ) {
          try {
            if (message.revision !== sourceRevision)
              throw new Error("源码版本已变化，请刷新。");
            const node = map.nodes.find((n) => n.id === message.id);
            if (!node) throw new Error("符号已失效。");
            // Only navigate to source locations already present in the analyzed map.
            const requested = Number.isInteger(message.line)
              ? message.line
              : node.line;
            const line = Math.max(node.line, Math.min(node.endLine, requested));
            const document = await vscode.workspace.openTextDocument(
              vscode.Uri.file(node.file),
            );
            if (document.getText() !== sources[node.file])
              throw new Error("源码已修改，请刷新后定位。");
            const position = new vscode.Position(
              Math.min(document.lineCount - 1, line - 1),
              0,
            );
            await vscode.window.showTextDocument(document, {
              viewColumn: vscode.ViewColumn.One,
              selection: new vscode.Range(position, position),
              preserveFocus: false,
            });
            post({
              requestId: message.requestId,
              view: readerView(map, sources, sourceRevision, selectedId),
            });
          } catch (error) {
            post({ requestId: message.requestId, error: String(error) });
          }
        }
      },
      undefined,
      context.subscriptions,
    );
    panel.onDidDispose(
      () => {
        panel = undefined;
        map = undefined;
        revision++;
        clearTimeout(timer);
        void worker?.terminate();
        worker = undefined;
      },
      undefined,
      context.subscriptions,
    );
  };
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ["typescript", "typescriptreact", "javascript", "javascriptreact"],
      {
        async provideHover(document, position, token) {
          if (!map) return;
          const file = normalize(document.uri.fsPath),
            text = document.getText(),
            line = position.line + 1;
          if (sources[file] !== text) return;
          const node = map.nodes
            .filter(
              (n) => n.file === file && n.line <= line && n.endLine >= line,
            )
            .sort((a, b) => a.endLine - a.line - (b.endLine - b.line))[0];
          if (!node) return;
          const config = await model.settings();
          if (!config.configured || !config.hoverEnabled) return;
          const controller = new AbortController(),
            subscription = token.onCancellationRequested(() =>
              controller.abort(),
            );
          try {
            const answer = await modelAction(
              "hover",
              { id: node.id, revision: sourceRevision, line },
              controller.signal,
            );
            if (token.isCancellationRequested || document.getText() !== text)
              return;
            const md = new vscode.MarkdownString();
            md.appendText("Scanf · AI 悬停注释\n\n" + answer.text);
            md.isTrusted = false;
            return new vscode.Hover(
              md,
              document.getWordRangeAtPosition(position),
            );
          } catch (error) {
            if (!token.isCancellationRequested)
              return new vscode.Hover(
                new vscode.MarkdownString().appendText(
                  "Scanf：" + String(error),
                ),
              );
          } finally {
            subscription.dispose();
          }
        },
      },
    ),
    vscode.commands.registerCommand("scanf.open", open),
    vscode.commands.registerCommand("scanf.refresh", refresh),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (supported.test(event.document.uri.fsPath)) schedule();
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (
        supported.test(doc.uri.fsPath) ||
        /[jt]sconfig.*\.json$/i.test(doc.uri.fsPath)
      )
        schedule();
    }),
    vscode.workspace.onDidCreateFiles(schedule),
    vscode.workspace.onDidDeleteFiles(schedule),
    vscode.workspace.onDidRenameFiles(schedule),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("scanf")) schedule();
    }),
    vscode.window.onDidChangeTextEditorSelection(selection),
    vscode.window.onDidChangeActiveTextEditor(selection),
    {
      dispose: () => {
        clearTimeout(timer);
        panel?.dispose();
        void worker?.terminate();
      },
    },
  );
  return {
    modelAction,
    getReadingSnapshot: () =>
      map ? readerView(map, sources, sourceRevision, selectedId) : undefined,
  };
}
