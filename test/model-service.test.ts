import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ModelService, type ModelConfig } from "../src/model-service";
import { ProjectReader } from "../src/project";
import { startMockModel } from "./mock-model";
test("model settings hide keys, validate endpoints, cache hovers and reject stale snapshots", async () => {
  const backend = await startMockModel();
  let saved: ModelConfig | undefined;
  const service = new ModelService({
    read: async () => saved,
    write: async (value) => {
      saved = value;
    },
  });
  const project = new ProjectReader(path.resolve("examples"));
  await project.refresh();
  const node = project.map!.nodes.find((n) => n.name === "checkout")!;
  const snapshot = (id: string, revision: string) =>
    project.inspect(id, revision);
  const payload = { id: node.id, revision: project.revision, line: node.line };
  try {
    await assert.rejects(
      service.action("hover", payload, snapshot),
      /模型设置/,
    );
    const settings = await service.action("save", {
      baseUrl: backend.baseUrl,
      model: "test-model",
      apiKey: "scanf-test-key",
      hoverEnabled: true,
    });
    assert.equal(settings.hasKey, true);
    assert.equal(JSON.stringify(settings).includes("scanf-test-key"), false);
    await service.action("test");
    const [a, b] = await Promise.all([
      service.action("hover", payload, snapshot),
      service.action("hover", payload, snapshot),
    ]);
    assert.equal(a.text, b.text);
    assert.equal(backend.calls.length, 2);
    assert.equal(backend.calls[1].authorized, true);
    assert.equal(backend.calls[1].path, "/v1/chat/completions");
    assert.match(backend.calls[1].body.messages[1].content, /checkout|items/);
    await assert.rejects(
      service.action("hover", { ...payload, revision: "stale" }, snapshot),
      /版本/,
    );
    await assert.rejects(
      service.action("save", { baseUrl: "http://example.com", model: "x" }),
      /HTTPS/,
    );
    await service.action("save", {
      ...settings,
      baseUrl: backend.baseUrl,
      model: "unauthorized",
      hoverEnabled: true,
    });
    await assert.rejects(service.action("test"), /认证失败/);
    assert.equal(saved?.apiKey, "scanf-test-key");
    await service.action("save", { ...settings, hoverEnabled: false });
    await assert.rejects(service.action("hover", payload, snapshot), /已关闭/);
    assert.match(
      (await service.action("hover", { ...payload, manual: true }, snapshot))
        .text,
      /本机模拟接口/,
    );
    await service.action("save", {
      ...settings,
      baseUrl: "https://different.example/v1",
      hoverEnabled: true,
    });
    assert.equal(saved?.apiKey, "");
    await service.action("clear");
    assert.equal(saved, undefined);
  } finally {
    await backend.close();
  }
});
