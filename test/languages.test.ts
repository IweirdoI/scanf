import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { analyzeProject } from "../src/project-analyzer";
import { ProjectReader } from "../src/project";
import { languageFor } from "../src/languages";
import type { CodeMap } from "../src/model";

const root = path.resolve("output/polyglot-test").replace(/\\/g, "/");
const analyze = (files: Record<string, string>) =>
  analyzeProject(
    Object.fromEntries(
      Object.entries(files).map(([f, s]) => [`${root}/${f}`, s]),
    ),
    root,
  );
const calls = (map: CodeMap, name: string) => {
  const fn = map.nodes.find((n) => n.kind === "function" && n.name === name)!;
  assert.ok(fn, `missing ${name}`);
  return map.edges
    .filter((e) => e.source === fn.id && e.kind === "call")
    .map((e) => map.nodes.find((n) => n.id === e.target)!.name);
};
test("one graph contains TS / JS / Python / C / C++ / Java / Rust / Go without cross-language name matching", async () => {
  const files = {
    "front.ts":
      "export function same(x: number){return x;} export function startTS(){return same(1)}",
    "ui.js": "export function startJS(){return same(1)}",
    "worker.py":
      "# 中文🙂\ndef same(count: int, minimum=1):\n    return count + minimum\ndef startPY():\n    return same(2)\n",
    "main.c":
      "int same(int count){return count;} int main(void){return same(3);}",
    "native.cpp":
      "int startCPP(int count){return count;} int wrapper(){return startCPP(4);}",
    "Main.java":
      "class Main { static int same(int count){return count;} public static void main(String[] args){same(5);} }",
    "main.rs": "fn same(count: i32)->i32{count} fn main(){same(6);}",
    "main.go":
      "package main\nfunc same(count int) int {return count}\nfunc main(){same(7)}",
  };
  const map = await analyze(files);
  assert.equal(map.languages?.length, 8);
  for (const language of ["python", "c", "java", "rust", "go"]) {
    const module = map.nodes.find(
      (n) => n.kind === "module" && n.language === language,
    )!;
    const fns = map.nodes.filter(
      (n) => n.kind === "function" && n.file === module.file,
    );
    const same = fns.find((n) => /(?:^|\.)same$/.test(n.name))!;
    assert.deepEqual(same.parameters, [
      "count",
      ...(language === "python" ? ["minimum"] : []),
    ]);
    assert.ok(map.edges.some((e) => e.kind === "call" && e.target === same.id));
    assert.ok(same.parameterDetails?.[0].uses.length);
  }
  assert.deepEqual(calls(map, "startJS"), []);
  assert.deepEqual(calls(map, "startTS"), ["same"]);
  assert.deepEqual(calls(map, "wrapper"), ["startCPP"]);
  for (const edge of map.edges)
    assert.equal(
      map.nodes.find((n) => n.id === edge.source)?.language,
      map.nodes.find((n) => n.id === edge.target)?.language,
    );
  const python = map.nodes.find(
    (n) => n.name === "same" && n.language === "python",
  )!;
  const ref = map.references!.find((r) => r.targetId === python.id)!;
  assert.equal(
    files["worker.py"].slice(ref.from, ref.to),
    "same",
    "Unicode source offsets must remain UTF-16 editor offsets",
  );
  assert.equal(python.line, 2);
  assert.equal(map.entries!.filter((e) => e.kind === "startup").length, 4);
});

test("Python local imports, aliases, lexical shadowing and nested functions use evidence-backed targets", async () => {
  const map = await analyze({
    "pkg/helpers.py": "def work(value: int):\n    return value\n",
    "pkg/main.py":
      "from .helpers import work as run\nimport pkg.helpers as helpers\ndef start():\n    return run(1) + helpers.work(2)\ndef shadow(run):\n    return run(3)\ndef outer():\n    def run(value):\n        return value\n    return run(4)\n",
  });
  assert.deepEqual(calls(map, "start"), ["work", "work"]);
  assert.deepEqual(calls(map, "shadow"), []);
  assert.deepEqual(calls(map, "outer"), ["run"]);
  assert.equal(map.edges.filter((e) => e.kind === "import").length, 2);
});

test("Go same-package files resolve functions without confusing methods; Java overloads and receivers remain unresolved", async () => {
  const map = await analyze({
    "main.go": "package main\nfunc main(){ helper(1); missing(1) }",
    "helper.go":
      "package main\nfunc helper(value int) int { return value }\ntype S struct{}\nfunc (s S) missing(value int) int { return value }",
    "Main.java":
      "class Main { static void overloaded(int a){} static void overloaded(String a){} void run(Main other){overloaded(1);other.overloaded(1);} }",
  });
  assert.deepEqual(calls(map, "main"), ["helper"]);
  assert.deepEqual(calls(map, "Main.run"), []);
  assert.ok(map.unresolved.some((n) => n.label === "missing"));
});

test("Rust explicit use and C includes produce same-language module edges; indirect calls stay unresolved", async () => {
  const map = await analyze({
    "src/main.rs":
      "mod helper; use crate::helper::work as run; fn main(){run(1);}",
    "src/helper.rs": "pub fn work(value: i32)->i32 { value }",
    "main.c":
      '#include "helper.h"\nint work(int x){return x;}\nint apply(int (*work)(int)){return work(2);}',
    "helper.h": "int work(int value);",
  });
  assert.ok(
    map.edges.some((e) => e.kind === "import" && e.label.includes("helper.h")),
  );
  assert.deepEqual(calls(map, "main"), ["work"]);
  assert.deepEqual(calls(map, "apply"), []);
});

test("reassigned module symbols, bare Python methods and uncalled closures do not invent direct calls", async () => {
  const map = await analyze({
    "shadow.py":
      "def work():\n    return 1\nwork = external\ndef start():\n    return work()\nclass Service:\n    def local(self):\n        return 1\n    def run(self):\n        return local()\n",
    "main.go":
      "package main\nfunc helper(){}\nfunc main(){ f := func(){helper()}; _ = f }",
  });
  assert.deepEqual(calls(map, "start"), []);
  assert.deepEqual(calls(map, "Service.run"), []);
  assert.deepEqual(calls(map, "main"), []);
});

test("mixed project reading session exposes full Python source, parameter use ranges, and script guard", async () => {
  const reader = new ProjectReader(path.resolve("examples"));
  const snapshot = await reader.refresh();
  assert.ok(snapshot.languages?.includes("python"));
  assert.ok(snapshot.languages?.includes("typescript"));
  const worker = reader.map!.nodes.find((n) => n.name === "run_worker")!;
  const view = reader.inspect(worker.id, snapshot.revision);
  assert.match(view.file!.text, /if __name__/);
  assert.ok(view.calls?.children.some((n) => n.label === "normalize_count"));
  const param = view.selected!.parameterDetails![0];
  assert.equal(view.file!.text.slice(param.from, param.to), "count");
  assert.ok(reader.map!.entries!.some((e) => e.label.endsWith("__main__")));
  const normalize = reader.map!.nodes.find(
    (n) => n.name === "normalize_count",
  )!;
  assert.equal(normalize.parameterDetails![0].descriptionSource, "comment");
  assert.match(normalize.parameterDetails![0].description, /Number of tasks/);
  assert.equal(languageFor("README.md"), undefined);
});
