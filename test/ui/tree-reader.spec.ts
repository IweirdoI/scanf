import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { analyze } from "../../src/analyzer";
import { readerView } from "../../src/reader-model";
let server: ChildProcess, url: string;
test.beforeAll(async () => {
  server = spawn(
    process.execPath,
    ["dist/mcp.js", "--preview", "--root", path.resolve("examples")],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("preview startup timeout")),
      20000,
    );
    let stderr = "";
    server.stderr!.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/http:\/\/127\.0\.0\.1:\d+\/#\w+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    server.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`preview exit ${code}: ${stderr}`));
    });
  });
});
test.afterAll(() => {
  server?.kill();
});
test("mixed-language workspace opens full Python source, parameters and call navigation alongside TypeScript", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator("#status")).toContainText("python");
  // Search reveals the nested directory and file path without manually expanding every level.
  await page.locator("#tree-filter").fill("run_worker");
  await page.locator("#tree .tree-symbol").filter({ hasText: "run_worker" }).last().click();
  await expect(page.locator("#name")).toHaveText("run_worker");
  if (await page.locator("#app").getAttribute("data-mode") !== "workspace") await page.locator("#mode").click();
  await expect(page.locator("#source")).toContainText('if __name__ == "__main__"');
  await expect(page.locator("#parameters")).toContainText("count");
  await page.locator("#source .cm-symbol-link").filter({ hasText: "normalize_count" }).last().click({ modifiers: ["Control"] });
  await expect(page.locator("#name")).toHaveText("normalize_count");
  await expect(page.locator("#parameters")).toContainText("Number of tasks requested");
  await page.locator('#parameters [data-parameter="count"]').click();
  await expect(page.locator("#source .cm-parameter-focus").first()).toBeVisible();
  await page.locator("#tree-filter").fill("checkout");
  await page.locator("#tree .tree-symbol").filter({ hasText: "checkout" }).last().click();
  await expect(page.locator("#name")).toHaveText("checkout");
  await expect(page.locator("#file-tabs")).toContainText("worker.py");
  await expect(page.locator("#file-tabs")).toContainText("checkout.ts");
  await page.screenshot({ path: "output/polyglot-workspace.png" });
  expect(errors).toEqual([]);
});
test("file tabs close inactive and active files, show an empty editor and reopen from navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await expect(page.locator("#status")).toContainText("工作区源码");
  // Start with a deliberate empty editor regardless of backend's initial selection.
  while (await page.locator("[data-close-file]").count()) {
    await page.locator("[data-close-file]").first().click();
  }
  await expect(page.locator("#editor-empty")).toBeVisible();
  await page
    .locator("#tree .tree-symbol")
    .filter({ hasText: "checkout" })
    .last()
    .click();
  await expect(page.locator("#name")).toHaveText("checkout");
  await page
    .locator("#tree summary[data-symbol]")
    .filter({ hasText: "pricing.ts" })
    .click();
  await page
    .locator("#tree summary[data-symbol]")
    .filter({ hasText: "storage.ts" })
    .click();
  await expect(page.locator("[data-close-file]")).toHaveCount(3);
  await page
    .getByRole("button", { name: "关闭 checkout.ts", exact: true })
    .click();
  await expect(page.locator("[data-close-file]")).toHaveCount(2);
  await expect(page.locator("#file-tabs .selected")).toContainText(
    "storage.ts",
  );
  await page
    .getByRole("button", { name: "关闭 storage.ts", exact: true })
    .click();
  await expect(page.locator("#file-tabs .selected")).toContainText(
    "pricing.ts",
  );
  await expect(page.locator("#source")).toContainText("discount");
  await page
    .getByRole("button", { name: "关闭 pricing.ts", exact: true })
    .click();
  await expect(page.locator("#editor-empty")).toBeVisible();
  await expect(page.locator("#source")).toBeHidden();
  await expect(page.locator("#context-range")).toHaveText("未打开文件");
  await page.locator("#pin").click();
  await expect(page.locator("[data-close-file]")).toHaveCount(0);
  await page.locator("#mode").click();
  await expect(page.locator("[data-close-file]")).toHaveCount(0);
  await page.locator("#empty-quick-open").click();
  await page.locator("#command-input").fill("subtotal");
  await page.keyboard.press("Enter");
  await expect(page.locator("#name")).toHaveText("subtotal");
  await expect(page.locator("#source")).toBeVisible();
  await page.screenshot({ path: "output/reader-file-tabs-close.png" });
  // Keyboard-accessible close and focus return to the empty-state action.
  await page.locator("#file-tabs [data-file]").focus();
  await page.keyboard.press("Delete");
  await expect(page.locator("#editor-empty")).toBeVisible();
  await expect(page.locator("#empty-quick-open")).toBeFocused();
  expect(errors).toEqual([]);
});
test("real local service renders project and call trees, source navigation and question draft", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await expect(page.locator("#status")).toContainText("工作区源码");
  await page
    .locator(".tree-symbol")
    .filter({ hasText: "checkout" })
    .last()
    .click();
  await expect(page.locator("#name")).toHaveText("checkout");
  await expect(page.locator("#source")).toContainText("购物车为空");
  await page.locator("#entries-tab").click();
  const entry = page
    .locator("#tree summary[data-symbol]")
    .filter({ hasText: "checkout ·" });
  await entry.click();
  const entryBranch = entry.locator("..");
  await expect(entryBranch.locator(":scope > ul > li")).toHaveCount(3);
  await expect(entryBranch).toContainText("subtotal");
  await expect(entryBranch).toContainText("saveOrder");
  await page.screenshot({
    path: "output/reader-checkout-tree.png",
    fullPage: true,
  });
  await entryBranch
    .locator("[data-symbol]")
    .filter({ hasText: "saveOrder" })
    .click();
  await expect(page.locator("#name")).toHaveText("saveOrder");
  await expect(page.locator("#source")).toContainText("fetch('/api/orders'");
  await expect(entryBranch).toContainText("checkout");
  await expect(page.locator("#entries-tab")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#project-tab").click();
  await expect(page.locator("#name")).toHaveText("saveOrder");
  await page.locator("#entries-tab").click();
  await page.locator("#tree-filter").fill("checkout");
  await expect(page.locator("#tree")).toContainText("checkout");
  await page.locator("#tree-filter").clear();
  await page.locator("#inspector-toggle").click();
  await page.locator("#ask").click();
  await expect(page.locator("#feedback")).toContainText("saveOrder");
  await expect(page.locator("#navigate")).toBeHidden();
  await page.locator("#steps-tab").click();
  await expect(page.locator("#steps")).toContainText("抛错");
  await page.screenshot({
    path: "output/reader-tree-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 960 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/reader-tree-narrow.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("#status")).toContainText("工作区源码");
  expect(new URL(page.url()).hash).toBe("");
  const endpoint = url.split("/#")[0] + "/api";
  expect(
    (await request.post(endpoint, { data: { action: "refresh" } })).status(),
  ).toBe(401);
  expect(
    (
      await request.post(endpoint, {
        headers: {
          Authorization: "Bearer " + url.split("#")[1],
          Origin: "https://evil.example",
        },
        data: { action: "refresh" },
      })
    ).status(),
  ).toBe(403);
  expect(errors).toEqual([]);
});

test("opening localhost without a token fails visibly instead of waiting for an MCP host", async ({
  page,
}) => {
  await page.goto(url.split("#")[0]);
  await expect(page.locator("#status")).toContainText("缺少本机连接令牌");
});

test("workspace compares full syntax-highlighted files and parameter usage, follows definitions and returns", async ({
  page,
}) => {
  await page.goto(url);
  await page
    .locator("#tree .tree-symbol")
    .filter({ hasText: "checkout" })
    .last()
    .click();
  await page.locator("#mode").click();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "workspace");
  await expect(page.locator("#context-range")).toContainText("完整文件");
  await expect(page.locator("#source")).toContainText("from './pricing'");
  await expect(page.locator("#parameters")).toContainText("items");
  await expect(page.locator("#parameters")).toContainText("源码用法");
  await page
    .locator("#source .cm-symbol-link")
    .filter({ hasText: "subtotal" })
    .last()
    .click({ modifiers: ["Control"] });
  await expect(page.locator("#name")).toHaveText("subtotal");
  await expect(page.locator("#file-tabs")).toContainText("pricing.ts");
  await expect(page.locator("#source")).toContainText("discount");
  await page.locator('#parameters [data-parameter="items"]').click();
  await expect(
    page.locator("#source .cm-parameter-focus").first(),
  ).toBeVisible();
  await page.locator("#back").click();
  await expect(page.locator("#name")).toHaveText("checkout");
  await page.locator("#forward").click();
  await expect(page.locator("#name")).toHaveText("subtotal");
  await page.locator("#find").click();
  await expect(page.locator(".cm-search")).toBeVisible();
  await page.locator('.cm-search input[name="search"]').fill("return");
  await page.locator('.cm-search input[name="search"]').press("Enter");
  await expect(page.locator(".cm-searchMatch").first()).toBeVisible();
  await page.screenshot({ path: "output/reader-workspace.png" });
});
test("quick navigation supports file/symbol search, keyboard selection, line numbers and dismissal", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await expect(page.locator("#status")).toContainText("工作区源码");
  await page.keyboard.press("Control+k");
  await expect(page.locator("#command-dialog")).toBeVisible();
  await page.locator("#command-input").fill("not-a-real-symbol");
  await expect(page.locator(".command-empty")).toContainText("没有匹配");
  await page.keyboard.press("ArrowDown");
  await page.locator("#command-input").fill("check");
  await expect(page.locator('#command-results [role="option"]')).toHaveCount(2);
  await expect(page.locator("#quick-result-0")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#quick-result-1")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Enter");
  await expect(page.locator("#command-dialog")).toBeHidden();
  await expect(page.locator("#name")).toHaveText("checkout");
  await page.locator("#mode").click();
  await page.keyboard.press("Control+g");
  await expect(page.locator("#command-input")).toHaveValue(":");
  await page.locator("#command-input").fill(":99999");
  await expect(page.locator('#command-results [role="option"]')).toHaveCount(0);
  await page.locator("#command-input").fill(":9");
  await page.keyboard.press("Enter");
  await expect(page.locator("#source .cm-activeLine")).toContainText("payable");
  await page.keyboard.press("Control+p");
  await page.locator("#command-input").fill("save");
  await page.screenshot({ path: "output/reader-quick-navigation.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator("#inspector")).toBeVisible();
  await expect(page.locator("#command-dialog")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#inspector")).toBeHidden();
  await page.keyboard.press("Control+k");
  await page.locator("#command-input").fill("saveOrder");
  await page.keyboard.press("Enter");
  await expect(page.locator("#tree .tree-symbol.selected")).toHaveText(
    /saveOrder/,
  );
  await expect(page.locator("#tree .tree-symbol.selected")).toBeVisible();
  expect(errors).toEqual([]);
});
test("workspace themes, pointer/keyboard split sizing and small-window reading stay usable", async ({
  page,
}) => {
  await page.goto(url);
  await page
    .locator("#tree .tree-symbol")
    .filter({ hasText: "checkout" })
    .last()
    .click();
  await page.locator("#mode").click();
  const divider = page.getByRole("separator", { name: "调整导航栏宽度" });
  const bounds = (await divider.boundingBox())!;
  await page.mouse.move(bounds.x + 3, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(315, bounds.y + 100);
  await page.mouse.up();
  await expect(divider).toHaveAttribute("aria-valuenow", "315");
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "331");
  await page.keyboard.press("Home");
  await expect(divider).toHaveAttribute("aria-valuenow", "180");
  await divider.dblclick();
  await expect(divider).toHaveAttribute("aria-valuenow", "250");
  await page.screenshot({
    path: "output/reader-redesign-light.png",
    animations: "disabled",
  });
  await page.locator("#theme").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#theme")).toHaveAttribute(
    "aria-label",
    "切换为浅色主题",
  );
  await page.screenshot({
    path: "output/reader-redesign-dark.png",
    animations: "disabled",
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 430, height: 800 });
  await page
    .locator("#tree .tree-symbol")
    .filter({ hasText: "checkout" })
    .last()
    .click();
  await expect(page.locator("#source")).toContainText("购物车为空");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "output/reader-redesign-compact.png" });
  await page.locator("#overflow-menu > summary").click();
  await page.locator("#menu-pin").click();
  await expect(page.locator("#pin")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#overflow-menu")).not.toHaveAttribute("open");
  await page.locator("#overflow-menu > summary").click();
  await page.locator("#menu-refresh").click();
  await expect(page.locator("#source")).toContainText("购物车为空");
  await page.locator("#inspector-toggle").click();
  await expect(page.locator("#parameters")).toContainText("items");
  await page.locator("#inspector-scrim").click({ position: { x: 5, y: 40 } });
  await expect(page.locator("#inspector")).toBeHidden();
});
test("VS Code bridge preserves pinned reading position and sends the exact source location", async ({
  page,
}) => {
  const root = path.resolve("examples");
  const files = Object.fromEntries(
    readdirSync(root)
      .filter((n) => n.endsWith(".ts"))
      .map((n) => [
        path.join(root, n),
        readFileSync(path.join(root, n), "utf8"),
      ]),
  );
  const map = analyze(files, root);
  const normalized = Object.fromEntries(
    Object.entries(files).map(([f, s]) => [f.replace(/\\/g, "/"), s]),
  );
  const checkout = map.nodes.find((n) => n.name === "checkout")!,
    save = map.nodes.find((n) => n.name === "saveOrder")!;
  const view = readerView(map, normalized, "test-revision", checkout.id),
    next = readerView(map, normalized, "test-revision", save.id);
  await page.route("https://scanf.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"><meta name="scanf-nonce" content="scanf-test"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-scanf-test'; style-src 'nonce-scanf-test'"><style nonce="scanf-test">${readFileSync("media/reader.css", "utf8")}</style></head><body><div id="app"></div><script nonce="scanf-test">window.sent=[];window.acquireVsCodeApi=()=>({postMessage:m=>window.sent.push(m)});</script><script nonce="scanf-test">${readFileSync("dist/reader.js", "utf8").replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
    }),
  );
  await page.goto("https://scanf.test/");
  await page.evaluate(
    (v) => window.postMessage({ type: "view", view: v }, "*"),
    view,
  );
  await expect(page.locator("#name")).toHaveText("checkout");
  await page.locator("#pin").click();
  await page.evaluate(
    (v) => window.postMessage({ type: "view", view: v, selection: true }, "*"),
    next,
  );
  await expect(page.locator("#name")).toHaveText("checkout");
  await page.locator("#pin").click();
  await page.evaluate(
    (v) => window.postMessage({ type: "view", view: v, selection: true }, "*"),
    next,
  );
  await expect(page.locator("#name")).toHaveText("saveOrder");
  await page.locator("#navigate").click();
  const sent = await page.evaluate(() => (window as any).sent);
  expect(
    sent.some(
      (m: any) =>
        m.type === "navigate" &&
        m.id === next.file!.moduleId &&
        m.line === 1 &&
        m.revision === "test-revision",
    ),
  ).toBe(true);
  const malicious = structuredClone(next);
  malicious.selected!.name = "<img src=x onerror=alert(1)>";
  await page.evaluate(
    (v) => window.postMessage({ type: "view", view: v }, "*"),
    malicious,
  );
  await expect(page.locator("#name img")).toHaveCount(0);
});
