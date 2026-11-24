import * as vscode from "vscode";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startMockModel } from "./mock-model";

export async function run() {
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
    const hoverText=(hover??[]).flatMap(h=>h.contents.map(c=>typeof c==='string'?c:'value' in c?c.value:'')).join('\n');
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
    fs.writeFileSync(
      path.resolve(__dirname, "../output/extension-host-result.json"),
      JSON.stringify(
        {
          passed: true,
          backend: "local mock API (not a real model)",
          nativeHover: true,
          modelSettings: true,
          fullExplanation: true,
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
