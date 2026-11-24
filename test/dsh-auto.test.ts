import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("DSH host starts a scoped reader automatically, reuses it and closes it on unload", async () => {
  const plugin = await import(
    pathToFileURL(path.resolve("adapters/dsh/lib/index.js")).href
  );
  let route: any, cleanup: any;
  const root = path.resolve("examples");
  plugin.apply({
    connection: { fetch: { register: (r: any) => (route = r) } },
    sessionPersistence: {
      stat: async (id: string) =>
        id === "session-a" ? { header: { cwd: root } } : undefined,
    },
    effect: (fn: () => any) => {
      cleanup = fn();
    },
  });
  const connect = async (sessionId: string, selectedRoot?: string) => {
    const response = await route.fetch(
      new Request("http://dsh/api/scanf/connect", {
        method: "POST",
        body: JSON.stringify({
          type: "client-request",
          rpcId: "test-id",
          payload: {
            sessionId,
            ...(selectedRoot ? { root: selectedRoot } : {}),
          },
        }),
      }),
    );
    return (await response.json()).result;
  };
  try {
    const [a, b] = await Promise.all([
      connect("session-a"),
      connect("session-a"),
    ]);
    assert.equal(a.ok, true);
    assert.equal(a.value.url, b.value.url);
    const url = new URL(a.value.url),
      token = url.hash.slice(1);
    url.hash = "";
    assert.equal((await fetch(url)).status, 200);
    assert.equal(
      (await fetch(new URL("api", url), { method: "POST", body: "{}" })).status,
      401,
    );
    const response = await fetch(new URL("api", url), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "refresh" }),
    });
    const data = await response.json();
    assert.equal(data.view.root, root.replace(/\\/g, "/"));
    assert.ok(data.view.languages.includes("python"), "DSH bundled host must load parser assets");
    assert.ok(data.view.languages.includes("go"));
    assert.equal((await connect("missing")).ok, false);
    assert.equal((await connect("session-a", "relative/path")).ok, false);
    const switched = await connect("session-a", path.resolve("src"));
    assert.equal(switched.ok, true);
    assert.notEqual(switched.value.url, a.value.url);
    await cleanup();
    cleanup = undefined;
    await assert.rejects(fetch(url));
  } finally {
    if (cleanup) await cleanup();
  }
});
