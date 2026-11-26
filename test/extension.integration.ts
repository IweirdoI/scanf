import * as vscode from "vscode";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startMockModel } from "./mock-model";

async function runSuite() {
  fs.writeFileSync(
    path.resolve(__dirname, "../output/native-extension-result.json"),
    JSON.stringify({ passed: false, state: "running" }),
  );
  const extension = vscode.extensions.getExtension(
    "scanf-local.scanf-code-reader",
  );
  assert.ok(extension, "development extension must be discovered");
  await extension.activate();
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("scanf.open"));
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder);
  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(folder.uri, "checkout.ts"),
  );
  await vscode.window.showTextDocument(doc);
  const mainEditor = vscode.window.activeTextEditor!;
  mainEditor.selection = new vscode.Selection(4, 0, 4, 0);
  await vscode.commands.executeCommand("scanf.open");
  // Extension-host startup and command registration smoke test. UI behavior is tested separately.
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const snapshot = extension.exports.getReadingSnapshot();
  assert.ok(
    snapshot?.project.children.length,
    "worker must finish and expose a reading tree",
  );
  assert.ok(
    snapshot.source.length,
    "reading snapshot must contain actual source",
  );
  assert.ok(
    !vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .some((tab) => tab.input instanceof vscode.TabInputWebview),
    "Scanf must not open another editor / webview tab",
  );
  assert.equal(
    vscode.window.activeTextEditor?.document.uri.toString(),
    doc.uri.toString(),
  );
  const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
    "vscode.executeCodeLensProvider",
    doc.uri,
  );
  assert.ok(lenses?.some((lens) => lens.command?.command === "scanf.explain"));
  const tree = extension.exports.getNativeNavigation();
  assert.ok(tree.some((node: any) => node.label === "项目逻辑入口"));
  assert.ok(!tree.some((node: any) => node.label === "文件结构"));
  const subtotalId = snapshot.calls.children.find(
    (node: any) => node.label === "subtotal",
  ).symbolId;
  const target = { id: subtotalId, revision: snapshot.revision };
  await extension.exports.navigate(target);
  assert.ok(
    vscode.window.activeTextEditor!.document.fileName.endsWith("pricing.ts"),
    "tree navigation must open native source",
  );
  await vscode.commands.executeCommand("scanf.pin");
  await vscode.window.showTextDocument(doc);
  mainEditor.selection = new vscode.Selection(4, 0, 4, 0);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(
    extension.exports.getReadingSnapshot().selected.name,
    "subtotal",
    "pinned navigation must not follow another editor",
  );
  await vscode.commands.executeCommand("scanf.pin");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(
    extension.exports.getReadingSnapshot().selected.name,
    "checkout",
  );
  const parameterHovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    doc.uri,
    new vscode.Position(3, 32),
  );
  assert.ok(
    (parameterHovers ?? []).some((hover) =>
      hover.contents.some(
        (content) =>
          typeof content === "object" &&
          "value" in content &&
          /Scanf/.test(content.value),
      ),
    ),
    "source-backed hover works without a model key",
  );
  const backend = await startMockModel();
  try {
    const config = await extension.exports.modelAction("save", {
      baseUrl: backend.baseUrl,
      model: "native-test-model",
      apiKey: "scanf-test-key",
      hoverEnabled: true,
    });
    assert.equal(config.hasKey, true);
    assert.equal(JSON.stringify(config).includes("scanf-test-key"), false);
    await extension.exports.modelAction("test");
    const hover = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      doc.uri,
      new vscode.Position(3, 31),
    );
    const hoverText = (hover ?? [])
      .flatMap((h) =>
        h.contents.map((c) =>
          typeof c === "string" ? c : "value" in c ? c.value : "",
        ),
      )
      .join("\n");
    assert.match(
      hoverText,
      /本机模拟接口/,
      "native editor hover must call the configured model",
    );
    const answer = await extension.exports.modelAction("explain", {
      id: snapshot.selected.id,
      revision: snapshot.revision,
      line: snapshot.selected.line,
    });
    assert.match(answer.text, /本机模拟接口/);
    assert.ok(snapshot.languages.includes("python"));
    const pythonDoc = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(folder.uri, "polyglot", "worker.py"),
    );
    await vscode.window.showTextDocument(pythonDoc);
    await vscode.commands.executeCommand("scanf.open");
    const deadline = Date.now() + 10000;
    let pythonSnapshot;
    do {
      await new Promise((resolve) => setTimeout(resolve, 200));
      pythonSnapshot = extension.exports.getReadingSnapshot();
    } while (
      !pythonSnapshot?.file?.path.endsWith("worker.py") &&
      Date.now() < deadline
    );
    assert.match(pythonSnapshot?.file?.text ?? "", /if __name__/);
    const pythonHovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      pythonDoc.uri,
      new vscode.Position(4, 24),
    );
    const pythonHoverText = (pythonHovers ?? [])
      .flatMap((hover) =>
        hover.contents.map((content) =>
          typeof content === "string"
            ? content
            : "value" in content
              ? content.value
              : "",
        ),
      )
      .join("\n");
    assert.match(
      pythonHoverText,
      /本机模拟接口/,
      "Python native hover must use the shared model service",
    );
    const otherRoot = path.resolve(__dirname, "../output/native-other-project");
    fs.mkdirSync(otherRoot, { recursive: true });
    fs.writeFileSync(
      path.join(otherRoot, "other.py"),
      "def other_project(value: int):\n    return value + 1\n",
    );
    assert.ok(
      vscode.workspace.workspaceFolders?.some(
        (folder) => folder.uri.fsPath.toLowerCase() === otherRoot.toLowerCase(),
      ),
      "native test runner must open both workspace folders from startup",
    );
    const otherDoc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(otherRoot, "other.py")),
    );
    await vscode.window.showTextDocument(otherDoc);
    const otherDeadline = Date.now() + 10000;
    while (
      extension.exports.getReadingSnapshot()?.root !==
        otherRoot.replace(/\\/g, "/") &&
      Date.now() < otherDeadline
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      extension.exports.getReadingSnapshot()?.root,
      otherRoot.replace(/\\/g, "/"),
      "another project must be indexed from its own workspace root",
    );
    assert.equal(
      extension.exports.getReadingSnapshot()?.selected.name,
      "other_project",
    );
    const otherSnapshot = extension.exports.getReadingSnapshot();
    const original = otherDoc.getText();
    const edit = new vscode.WorkspaceEdit();
    edit.insert(otherDoc.uri, new vscode.Position(0, 0), "# unsaved change\n");
    await vscode.workspace.applyEdit(edit);
    await assert.rejects(
      extension.exports.navigate({
        id: otherSnapshot.selected.id,
        revision: otherSnapshot.revision,
      }),
      /修改|变化/,
      "navigation must reject an unsaved stale document",
    );
    const restore = new vscode.WorkspaceEdit();
    restore.replace(
      otherDoc.uri,
      new vscode.Range(0, 0, otherDoc.lineCount, 0),
      original,
    );
    await vscode.workspace.applyEdit(restore);
    await otherDoc.save();
    fs.writeFileSync(
      path.resolve(__dirname, "../output/native-extension-result.json"),
      JSON.stringify(
        {
          passed: true,
          backend: "local mock API (not a real model)",
          nativeHover: true,
          modelSettings: true,
          fullExplanation: true,
          mixedLanguageWorker: true,
          pythonNativeHover: true,
          nativeCodeLens: true,
          nativeSourceNavigation: true,
          pinAndFollow: true,
          noDuplicatedEditor: true,
          otherProjectRoot: true,
          staleNavigationRejected: true,
          mockCalls: backend.calls.length,
          editor: doc.fileName,
        },
        null,
        2,
      ),
    );
  } finally {
    await extension.exports.modelAction("clear");
    await backend.close();
  }
}

export async function run() {
  try {
    await runSuite();
  } catch (error) {
    fs.writeFileSync(
      path.resolve(__dirname, "../output/native-extension-result.json"),
      JSON.stringify(
        {
          passed: false,
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        null,
        2,
      ),
    );
    throw error;
  }
}
