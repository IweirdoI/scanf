import * as vscode from "vscode";
import path from "node:path";
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { CodeMap, CodeNode } from "./model";
import { readerView } from "./reader-model";
import { ModelService } from "./model-service";
import { languageFor, sourceGlob, editorLanguageIds } from "./languages";
import { LogicNavigation } from "./native-navigation";
import { NativeDetails } from "./native-details";

const normalize = (file: string) => path.resolve(file).replace(/\\/g, "/");
type Target = { id: string; revision: string; line?: number };
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
  let map: CodeMap | undefined,
    sources: Record<string, string> = {},
    sourceRevision = "",
    selectedId: string | undefined;
  let root: vscode.WorkspaceFolder | undefined, worker: Worker | undefined;
  let sequence = 0,
    disposed = false,
    started = false,
    pinned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | undefined;
  const navigation = new LogicNavigation();
  const tree = vscode.window.createTreeView("scanf.logic", {
    treeDataProvider: navigation,
    showCollapseAll: true,
  });
  const lensesChanged = new vscode.EventEmitter<void>();
  const snapshot = () => {
    if (!map) return undefined;
    const view = readerView(map, sources, sourceRevision, selectedId);
    if (!selectedId) {
      view.selected = undefined;
      view.file = undefined;
      view.calls = undefined;
      view.callers = [];
    }
    return view;
  };
  const publish = () => {
    const view = snapshot();
    navigation.update(view);
    details.update(view);
    tree.title = pinned ? "逻辑导航 · 已固定" : "逻辑导航";
    tree.description = root?.name;
  };
  const selectFromEditor = () => {
    if (pinned || !map) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (sources[normalize(editor.document.uri.fsPath)] === undefined) {
      if (selectedId) {
        selectedId = undefined;
        publish();
      }
      return;
    }
    const file = normalize(editor.document.uri.fsPath),
      line = editor.selection.active.line + 1;
    const node =
      map.nodes
        .filter(
          (n) =>
            n.file === file &&
            n.kind === "function" &&
            n.line <= line &&
            n.endLine >= line,
        )
        .sort((a, b) => a.endLine - a.line - (b.endLine - b.line))[0] ??
      map.nodes.find((n) => n.file === file && n.kind === "module");
    if (node && node.id !== selectedId) {
      selectedId = node.id;
      publish();
    }
  };
  const modelSnapshot = (id: string, version: string) => {
    if (
      !map ||
      version !== sourceRevision ||
      !map.nodes.some((n) => n.id === id)
    )
      throw new Error("源码版本已变化，请刷新。");
    const view = readerView(map, sources, sourceRevision, id);
    const document = vscode.workspace.textDocuments.find(
      (doc) => normalize(doc.uri.fsPath) === view.file?.path,
    );
    if (document && document.getText() !== view.file?.text)
      throw new Error("源码已修改，正在刷新索引。");
    return view;
  };
  const modelAction = (
    operation: string,
    payload: any = {},
    signal?: AbortSignal,
  ) => model.action(operation, payload, modelSnapshot, signal);
  const report = (error: unknown) => {
    const message = String(error);
    tree.message = message;
    details.setMessage(message);
  };
  const chooseRoot = () => {
    const editor = vscode.window.activeTextEditor;
    return (
      (editor && vscode.workspace.getWorkspaceFolder(editor.document.uri)) ??
      root ??
      vscode.workspace.workspaceFolders?.[0]
    );
  };
  async function index(chosen: vscode.WorkspaceFolder) {
    const current = ++sequence;
    const previous = worker;
    worker = undefined;
    await previous?.terminate();
    if (current !== sequence || disposed) return;
    root = chosen;
    const oldSelection = selectedId;
    map = undefined;
    sources = {};
    sourceRevision = "";
    navigation.update();
    details.update();
    lensesChanged.fire();
    tree.message = `正在分析 ${chosen.name}…`;
    try {
      const configured = vscode.workspace
        .getConfiguration("scanf", chosen.uri)
        .get<number>("maxFiles", 150);
      const limit = Math.max(
        1,
        Math.min(
          500,
          Math.floor(Number.isFinite(configured) ? configured : 150),
        ),
      );
      const exclude =
        "**/{node_modules,.git,dist,build,coverage,.next,out,output,vendor,.venv,venv,__pycache__,.mypy_cache,.pytest_cache,target,.idea}/**";
      const candidates = await vscode.workspace.findFiles(
        new vscode.RelativePattern(chosen, sourceGlob),
        exclude,
        limit + 1,
      );
      const warnings: string[] = [];
      if (candidates.length > limit)
        warnings.push(
          `最多读取 ${limit} 个文件；请缩小项目范围或调整 scanf.maxFiles。`,
        );
      let uris = candidates.slice(0, limit);
      const active = vscode.window.activeTextEditor?.document;
      if (
        active &&
        languageFor(active.uri.fsPath) &&
        vscode.workspace.getWorkspaceFolder(active.uri)?.uri.toString() ===
          chosen.uri.toString() &&
        !uris.some((uri) => uri.toString() === active.uri.toString())
      )
        uris = [active.uri, ...uris].slice(0, limit);
      const files: Record<string, string> = {};
      let bytes = 0;
      for (const uri of uris) {
        try {
          const open = vscode.workspace.textDocuments.find(
            (doc) => doc.uri.toString() === uri.toString(),
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
      if (current !== sequence || disposed) return;
      await new Promise<void>((resolve, reject) => {
        const running = new Worker(context.asAbsolutePath("dist/worker.js"), {
          workerData: { files, root: chosen.uri.fsPath },
        });
        worker = running;
        let completed = false;
        running.once(
          "message",
          (message: { map?: CodeMap; error?: string }) => {
            completed = true;
            if (current !== sequence || disposed) {
              resolve();
              return;
            }
            if (message.error || !message.map) {
              reject(new Error(message.error ?? "分析失败"));
              return;
            }
            map = message.map;
            map.warnings.unshift(...warnings);
            sources = files;
            sourceRevision = createHash("sha256")
              .update(JSON.stringify(files))
              .digest("hex")
              .slice(0, 20);
            selectedId = map.nodes.some((node) => node.id === oldSelection)
              ? oldSelection
              : undefined;
            tree.message = map.nodes.length
              ? undefined
              : "没有找到支持的源码文件；请检查项目目录和分析提示。";
            publish();
            selectFromEditor();
            lensesChanged.fire();
            resolve();
          },
        );
        running.once("error", reject);
        running.once("exit", (code) => {
          if (worker === running) worker = undefined;
          if (!completed && current === sequence && !disposed)
            reject(new Error(`分析进程退出 (${code})`));
          else resolve();
        });
      });
    } catch (error) {
      if (current === sequence && !disposed) report(error);
    }
  }
  async function refresh() {
    const chosen = chooseRoot();
    if (!chosen || chosen.uri.scheme !== "file") {
      tree.message = "请先用 VS Code 打开本地项目文件夹。";
      return;
    }
    started = true;
    const pending = index(chosen);
    inflight = pending;
    await pending;
    if (inflight === pending) inflight = undefined;
  }
  const schedule = () => {
    if (!started) return;
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 650);
  };
  async function open() {
    await vscode.commands.executeCommand("workbench.view.extension.scanf");
    if (!started || root?.uri.toString() !== chooseRoot()?.uri.toString())
      await refresh();
    else {
      await inflight;
      selectFromEditor();
    }
  }
  async function navigate(target: Target) {
    const view = modelSnapshot(target.id, target.revision),
      node = view.selected!;
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(node.file),
    );
    if (document.getText() !== sources[node.file])
      throw new Error("源码已修改，请刷新后定位。");
    const line = Number.isInteger(target.line)
      ? Math.max(node.line, Math.min(node.endLine, target.line!))
      : node.line;
    const position = new vscode.Position(
      Math.min(document.lineCount - 1, line - 1),
      0,
    );
    await vscode.window.showTextDocument(document, {
      viewColumn:
        vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One,
      selection: new vscode.Range(position, position),
      preview: true,
    });
    selectedId = node.id;
    publish();
  }
  async function configureModel() {
    const previous = await model.settings();
    const baseUrl = await vscode.window.showInputBox({
      title: "Scanf · 模型设置 (1/4)",
      prompt: "OpenAI 兼容 API 地址；模型解释会向此地址发送有限源码。",
      value: previous.baseUrl,
      ignoreFocusOut: true,
    });
    if (baseUrl === undefined) return;
    const modelName = await vscode.window.showInputBox({
      title: "Scanf · 模型设置 (2/4)",
      prompt: "模型 ID",
      value: previous.model,
      ignoreFocusOut: true,
    });
    if (modelName === undefined) return;
    const apiKey = await vscode.window.showInputBox({
      title: "Scanf · 模型设置 (3/4)",
      prompt:
        previous.hasKey && baseUrl.replace(/\/+$/, "") === previous.baseUrl
          ? "API Key（留空沿用此地址的已有 Key）"
          : "API Key（本机无需 Key 的服务可留空）",
      password: true,
      ignoreFocusOut: true,
    });
    if (apiKey === undefined) return;
    const hover = await vscode.window.showQuickPick(
      [
        {
          label: "手动解释",
          description: "悬停只显示源码证据，点击解读才调用 API",
          enabled: false,
        },
        {
          label: "自动悬停解释",
          description: "停留在代码上时调用 API，可能产生费用",
          enabled: true,
        },
      ],
      {
        title: "Scanf · 模型设置 (4/4)",
        placeHolder: "选择模型调用方式",
        ignoreFocusOut: true,
      },
    );
    if (!hover) return;
    await modelAction("save", {
      baseUrl,
      model: modelName,
      apiKey,
      hoverEnabled: hover.enabled,
    });
    details.setMessage("模型配置已保存到 VS Code 凭据存储；可点击测试连接。");
  }
  async function explain(target?: Target) {
    await open();
    const view = target
      ? modelSnapshot(target.id, target.revision)
      : snapshot();
    if (!view?.selected || view.selected.kind !== "function") {
      details.setMessage("请先将光标移到要解释的函数中。");
      return;
    }
    selectedId = view.selected.id;
    publish();
    await vscode.commands.executeCommand("scanf.details.focus");
    if (!(await model.settings()).configured) {
      await configureModel();
      if (!(await model.settings()).configured) return;
    }
    details.setMessage("正在解读函数…");
    const answer = await modelAction("explain", {
      id: view.selected.id,
      revision: view.revision,
      line: view.selected.line,
    });
    details.setAnswer(view.selected.id, view.revision, answer.text);
  }
  const details = new NativeDetails(async (type, payload) => {
    if (type === "navigate") return navigate(payload);
    if (type === "explain") return explain(payload);
    if (type === "settings") return configureModel();
    if (type === "clear") {
      await modelAction("clear");
      details.setMessage("已清除模型配置和 Key。");
    }
    if (type === "test") {
      details.setMessage("正在测试连接…");
      const answer = await modelAction("test");
      details.setMessage(answer.text);
    }
  });
  const guarded =
    (fn: (...args: any[]) => unknown) =>
    async (...args: any[]) => {
      try {
        return await fn(...args);
      } catch (error) {
        report(error);
      }
    };
  context.subscriptions.push(
    navigation,
    tree,
    lensesChanged,
    vscode.window.registerWebviewViewProvider("scanf.details", details),
    vscode.commands.registerCommand("scanf.open", guarded(open)),
    vscode.commands.registerCommand("scanf.refresh", guarded(refresh)),
    vscode.commands.registerCommand("scanf.navigate", guarded(navigate)),
    vscode.commands.registerCommand("scanf.explain", guarded(explain)),
    vscode.commands.registerCommand(
      "scanf.modelSettings",
      guarded(configureModel),
    ),
    vscode.commands.registerCommand("scanf.settings", () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:scanf-local.scanf-code-reader",
      ),
    ),
    vscode.commands.registerCommand("scanf.pin", () => {
      pinned = !pinned;
      void vscode.commands.executeCommand("setContext", "scanf.pinned", pinned);
      if (!pinned) selectFromEditor();
      publish();
    }),
    vscode.languages.registerCodeLensProvider(
      editorLanguageIds.map((language) => ({ language, scheme: "file" })),
      {
        onDidChangeCodeLenses: lensesChanged.event,
        provideCodeLenses(document) {
          if (
            !map ||
            !vscode.workspace
              .getConfiguration("scanf", document.uri)
              .get("codeLens", true) ||
            sources[normalize(document.uri.fsPath)] !== document.getText()
          )
            return [];
          return map.nodes
            .filter(
              (node) =>
                node.kind === "function" &&
                (!node.parentId ||
                  !map!.nodes.some(
                    (parent) =>
                      parent.id === node.parentId && parent.kind === "function",
                  )) &&
                node.file === normalize(document.uri.fsPath),
            )
            .map(
              (node) =>
                new vscode.CodeLens(
                  new vscode.Range(node.line - 1, 0, node.line - 1, 0),
                  {
                    title: "Scanf: 解读函数",
                    command: "scanf.explain",
                    arguments: [{ id: node.id, revision: sourceRevision }],
                  },
                ),
            );
        },
      },
    ),
    vscode.languages.registerHoverProvider(
      editorLanguageIds.map((language) => ({ language, scheme: "file" })),
      {
        async provideHover(document, position, token) {
          if (
            !map ||
            sources[normalize(document.uri.fsPath)] !== document.getText()
          )
            return;
          const text = document.getText(),
            file = normalize(document.uri.fsPath),
            line = position.line + 1;
          const node = map.nodes
            .filter(
              (node) =>
                node.file === file && node.line <= line && node.endLine >= line,
            )
            .sort((a, b) => a.endLine - a.line - (b.endLine - b.line))[0];
          if (!node) return;
          const md = new vscode.MarkdownString();
          md.isTrusted = false;
          const offset = document.offsetAt(position),
            parameter = node.parameterDetails?.find(
              (p) =>
                (offset >= p.from && offset <= p.to) ||
                p.uses.some((use) => offset >= use.from && offset <= use.to),
            );
          if (parameter) {
            md.appendText(
              `Scanf · ${parameter.name}: ${parameter.type}\n\n${parameter.description}`,
            );
          } else if (line === node.line)
            md.appendText(
              `Scanf · ${node.name}\n\n${node.documentation ?? node.summary}`,
            );
          const config = await model.settings();
          if (config.configured && config.hoverEnabled) {
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
              if (md.value) md.appendText("\n\n");
              md.appendText("Scanf · AI 悬停注释\n\n" + answer.text);
            } catch (error) {
              if (!token.isCancellationRequested)
                md.appendText("\n\nScanf：" + String(error));
            } finally {
              subscription.dispose();
            }
          }
          return md.value && !token.isCancellationRequested
            ? new vscode.Hover(md, document.getWordRangeAtPosition(position))
            : undefined;
        },
      },
    ),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (languageFor(event.document.uri.fsPath)) {
        lensesChanged.fire();
        schedule();
      }
    }),
    vscode.workspace.onDidSaveTextDocument(schedule),
    vscode.workspace.onDidCreateFiles(schedule),
    vscode.workspace.onDidDeleteFiles(schedule),
    vscode.workspace.onDidRenameFiles(schedule),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("scanf")) {
        lensesChanged.fire();
        schedule();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (
        !root ||
        !vscode.workspace.workspaceFolders?.some(
          (folder) => folder.uri.toString() === root!.uri.toString(),
        )
      ) {
        pinned = false;
        root = undefined;
        void refresh();
      }
    }),
    vscode.window.onDidChangeTextEditorSelection(selectFromEditor),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!started || !editor || !languageFor(editor.document.uri.fsPath))
        return;
      const chosen = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (chosen && chosen.uri.toString() !== root?.uri.toString()) {
        pinned = false;
        void vscode.commands.executeCommand(
          "setContext",
          "scanf.pinned",
          false,
        );
        void refresh();
      } else selectFromEditor();
    }),
    tree.onDidChangeVisibility((event) => {
      if (event.visible && !started) void refresh();
    }),
    {
      dispose: () => {
        disposed = true;
        sequence++;
        clearTimeout(timer);
        void worker?.terminate();
      },
    },
  );
  void vscode.commands.executeCommand("setContext", "scanf.pinned", false);
  return {
    modelAction,
    getReadingSnapshot: snapshot,
    getNativeNavigation: () => navigation.roots,
    navigate,
    refresh,
  };
}
