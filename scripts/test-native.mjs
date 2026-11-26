import { runTests } from "@vscode/test-electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
await mkdir("output", { recursive: true });
const result = path.resolve("output/native-extension-result.json");
await writeFile(
  result,
  JSON.stringify({ passed: false, state: "not started" }),
);
const otherRoot = path.resolve("output/native-other-project");
await mkdir(otherRoot, { recursive: true });
await writeFile(
  path.join(otherRoot, "other.py"),
  "def other_project(value: int):\n    return value + 1\n",
);
const workspace = path.resolve("output/native-test.code-workspace");
await writeFile(
  workspace,
  JSON.stringify({
    folders: [{ path: path.resolve("examples") }, { path: otherRoot }],
  }),
);
await runTests({
  version: "1.90.0",
  cachePath: path.resolve("output/vscode-test"),
  extensionDevelopmentPath: process.cwd(),
  extensionTestsPath: path.resolve("dist/extension.integration.js"),
  launchArgs: [
    workspace,
    "--disable-extensions",
    "--skip-welcome",
    "--skip-release-notes",
    "--user-data-dir=" + path.resolve("output/vscode-isolated-profile"),
    "--extensions-dir=" + path.resolve("output/vscode-isolated-extensions"),
  ],
});
const report = JSON.parse(await readFile(result, "utf8"));
assert.equal(
  report.passed,
  true,
  "test host must write a fresh successful report",
);
console.log(JSON.stringify(report, null, 2));
