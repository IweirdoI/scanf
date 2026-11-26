import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { analyze } from "../src/analyzer";
import { readerView } from "../src/reader-model";
import { graphModel, graphHtml } from "../src/logic-graph";

test("fork graph separates ownership, outgoing calls, incoming arrows and recursion with real source targets", () => {
  const root = path.resolve("examples").replace(/\\/g, "/"),
    file = root + "/fork.ts";
  const source =
    "export function checkout(){ subtotal();discount();save(); function nested(){return 1} } function subtotal(){return 1} function discount(){discount()} function save(){return 2} function start(){checkout()}";
  const map = analyze({ [file]: source }, root),
    fn = map.nodes.find((n) => n.name === "checkout")!;
  const graph = graphModel(map, fn.id, 3)!;
  const edge = (name: string) => graph.edges.find((e) => e.to.name === name)!;
  assert.equal(edge("nested").to.relation, "contains");
  assert.equal(edge("subtotal").to.relation, "call");
  assert.equal(edge("start").to.relation, "incoming");
  assert.equal(
    new Set(
      graph.nodes
        .filter((n) => ["subtotal", "discount", "save"].includes(n.name))
        .map((n) => n.x),
    ).size,
    3,
    "branches must have separate positions",
  );
  assert.ok(graph.nodes.some((n) => n.reference === "递归"));
  assert.ok(graph.nodes.length <= 67);
  const view = readerView(map, { [file]: source }, "version", fn.id);
  const html = graphHtml(map, view, "", 2);
  assert.match(html, /marker-end="url\(#call-arrow\)"/);
  assert.match(html, /marker-start="url\(#incoming-arrow\)"/);
  assert.match(html, /style-src-attr 'unsafe-inline'/);
  assert.ok(!html.includes("SOURCE_MUST_NOT_BE_DUPLICATED"));
  assert.equal(graphModel(map, "invalid"), undefined);
});
