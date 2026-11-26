import { test, expect } from "@playwright/test";
import path from "node:path";
import { analyze } from "../../src/analyzer";
import { readerView } from "../../src/reader-model";
import { graphHtml } from "../../src/logic-graph";

test("branching graph shows connectors, source ownership and clickable calls in a narrow sidebar", async ({
  page,
}) => {
  const root = path.resolve("examples").replace(/\\/g, "/"),
    file = root + "/checkout.ts";
  const source =
    "export function checkout(){subtotal();discount();saveOrder();} function subtotal(){return 1} function discount(){return 2} function saveOrder(){return 3}";
  const map = analyze({ [file]: source }, root),
    fn = map.nodes.find((n) => n.name === "checkout")!;
  await page.setViewportSize({ width: 410, height: 850 });
  await page.evaluate(() => {
    (window as any).messages = [];
    (window as any).acquireVsCodeApi = () => ({
      postMessage: (message: any) => (window as any).messages.push(message),
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(
    graphHtml(
      map,
      readerView(map, { [file]: source }, "test-version", fn.id),
      "",
      2,
    ),
  );
  await expect(page.locator("svg path.edge.call")).toHaveCount(3);
  await expect(page.locator("svg path.edge.contains")).toHaveCount(1);
  const subtotal = page.locator("button.node").filter({ hasText: "subtotal" });
  expect(await subtotal.evaluate((el) => getComputedStyle(el).position)).toBe(
    "absolute",
  );
  await page.locator("#fit").click();
  expect(
    await page
      .locator("#canvas")
      .evaluate((el) => getComputedStyle(el).transform),
  ).not.toBe("none");
  await subtotal.click();
  const message = await page.evaluate(() => (window as any).messages.at(-1));
  expect(message.type).toBe("navigate");
  expect(message.revision).toBe("test-version");
  expect(map.nodes.find((n) => n.id === message.id)?.name).toBe("subtotal");
  await page.locator("#expand").click();
  expect(await page.evaluate(() => (window as any).messages.at(-1).type)).toBe(
    "expand",
  );
  await page.screenshot({
    path: "output/native-fork-graph.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
