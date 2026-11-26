import { test } from "node:test";
import assert from "node:assert/strict";
import { NativeDetails } from "../src/native-details";
import { readerView } from "../src/reader-model";
import { analyze } from "../src/analyzer";
import path from "node:path";

test("native sidebar renders escaped prose / evidence without another source editor and only handles allowed messages", async () => {
  const root = path.resolve("examples").replace(/\\/g, "/"),
    file = root + "/sensitive.ts";
  const source =
    'export function read(value: string) { return "SOURCE_MUST_NOT_BE_DUPLICATED"+value; }';
  const map = analyze({ [file]: source }, root),
    fn = map.nodes.find((node) => node.kind === "function")!;
  const snapshot = readerView(map, { [file]: source }, "test-version", fn.id);
  snapshot.selected!.summary = "<img src=x onerror=alert(1)> & summary";
  const calls: unknown[] = [];
  const details = new NativeDetails(async (type, payload) => {
    calls.push({ type, payload });
  });
  let handler: (message: any) => Promise<void>;
  const fake = {
    webview: {
      html: "",
      options: {},
      onDidReceiveMessage: (callback: any) => {
        handler = callback;
      },
    },
    onDidDispose: () => {},
  };
  details.resolveWebviewView(fake as any);
  details.update(snapshot);
  const html = fake.webview.html;
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt; &amp; summary"));
  assert.ok(!html.includes("SOURCE_MUST_NOT_BE_DUPLICATED"));
  assert.ok(!html.includes("CodeMirror"));
  assert.ok(!html.includes('id="file-tabs"'));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /data-line="1"/);
  await handler!({ type: "save", apiKey: "do-not-store" });
  assert.equal(
    calls.length,
    0,
    "arbitrary model operations must not reach the host",
  );
  await handler!({
    type: "navigate",
    id: fn.id,
    revision: "test-version",
    line: 1,
  });
  assert.equal(calls.length, 1);
  details.setAnswer(fn.id, "test-version", "<script>untrusted model</script>");
  assert.match(
    fake.webview.html,
    /&lt;script&gt;untrusted model&lt;\/script&gt;/,
  );
  details.update({ ...snapshot, revision: "changed" });
  assert.ok(!fake.webview.html.includes("untrusted model"));
});
