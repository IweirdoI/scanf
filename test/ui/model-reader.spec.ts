import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { startLocalReader } from "../../src/local-reader";
import { ModelService, type ModelConfig } from "../../src/model-service";
import { startMockModel } from "../mock-model";
test("DSH shared reader saves private settings, tests API, explains functions and hovers without editing source", async ({
  page,
}) => {
  const backend = await startMockModel();
  let saved: ModelConfig | undefined;
  const reader = await startLocalReader(
    path.resolve("examples"),
    readFileSync("dist/reader.html", "utf8"),
    0,
    new ModelService({
      read: async () => saved,
      write: async (value) => {
        saved = value;
      },
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(reader.url);
    await expect(page.locator("#status")).toContainText("工作区源码");
    await page.locator("#model-settings").click();
    await expect(page.locator("#model-dialog")).toBeVisible();
    await page.locator("#model-url").fill(backend.baseUrl);
    await page.locator("#model-name").fill("test-model");
    await page.locator("#model-key").fill("scanf-test-key");
    await page.locator("#model-test").click();
    await expect(page.locator("#model-feedback")).toContainText("连接成功");
    await expect(page.locator("#model-key")).toHaveValue("");
    await page.locator("#model-close").click();
    await page
      .locator("#tree .tree-symbol")
      .filter({ hasText: "checkout" })
      .last()
      .click();
    await page.locator("#mode").click();
    await page.locator("#model-explain").click();
    await expect(page.locator("#explanation")).toContainText("[本机模拟接口]");
    await page
      .locator("#source .cm-symbol-link")
      .filter({ hasText: "subtotal" })
      .last()
      .hover();
    await expect(page.locator(".tooltip-ai")).toContainText("[本机模拟接口]", {
      timeout: 10000,
    });
    await page.screenshot({ path: "output/model-hover-reader.png" });
    await page.locator("#model-settings").click();
    await expect(page.locator("#model-key")).toHaveValue("");
    await page.screenshot({ path: "output/model-settings-reader.png" });
    expect(backend.calls.every((c) => c.authorized)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await reader.close();
    await backend.close();
  }
});
