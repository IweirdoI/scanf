import type { CodeMap, CodeNode, Edge } from "./model";

export interface ReadingTree {
  id: string;
  label: string;
  kind: string;
  children: ReadingTree[];
  symbolId?: string;
  line?: number;
  reference?: "cycle" | "shared";
  truncated?: boolean;
  reason?: string;
  candidate?: boolean;
  evidence?: { file: string; line: number };
}
export interface ReaderView {
  revision: string;
  generatedAt: string;
  root: string;
  project: ReadingTree;
  entries: ReadingTree;
  selected?: CodeNode;
  source: string;
  sourceTruncated: boolean;
  calls?: ReadingTree;
  file?: {
    path: string;
    moduleId: string;
    text: string;
    lineCount: number;
    symbols: CodeNode[];
    references: Array<{
      from: number;
      to: number;
      targetId: string;
      name: string;
      file: string;
      line: number;
      type?: string;
      documentation?: string;
    }>;
  };
  callers?: Array<{ id: string; name: string; file: string; line: number }>;
  warnings: string[];
  unresolved: CodeMap["unresolved"];
  explanation?: {
    text: string;
    evidence: Array<{ line: number; endLine: number }>;
    parameters?: Array<{
      name: string;
      text: string;
      evidence: Array<{ line: number; endLine: number }>;
    }>;
  };
}

/** 从一个符号展开有限的关系树；缩进用于阅读导航，不代表执行顺序。
 * @param map 已解析的项目图，包含符号节点和调用 / 导入边。
 * @param id 本次展开的起点符号 ID；它指向具体文件和声明位置，不能只使用函数名。
 * @param kind 展开哪种边：call 是调用，import 是模块依赖。
 * @param maxDepth 最大展开深度；到达边界时标记截断，避免深链占满窗口。
 * @param maxNodes 单棵树的节点预算；共享节点和递归会显示为引用。
 */
export function relationTree(
  map: CodeMap,
  id: string,
  kind: Edge["kind"] = "call",
  maxDepth = 4,
  maxNodes = 120,
): ReadingTree {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let count = 0;
  const visit = (current: string, ancestors: Set<string>): ReadingTree => {
    const node = nodes.get(current);
    const tree: ReadingTree = {
      id: `${count++}:${current}`,
      label: node?.name ?? current,
      kind: node?.kind ?? "unknown",
      symbolId: current,
      line: node?.line,
      children: [],
    };
    if (ancestors.has(current)) {
      tree.reference = "cycle";
      return tree;
    }
    if (seen.has(current)) {
      tree.reference = "shared";
      return tree;
    }
    seen.add(current);
    const targets = [
      ...new Set(
        map.edges
          .filter((e) => e.source === current && e.kind === kind)
          .map((e) => e.target),
      ),
    ];
    if (ancestors.size >= maxDepth) {
      tree.truncated = targets.length > 0;
      return tree;
    }
    for (const target of targets) {
      if (count >= maxNodes) {
        tree.truncated = true;
        break;
      }
      tree.children.push(visit(target, new Set([...ancestors, current])));
    }
    return tree;
  };
  return visit(id, new Set());
}

/** 按源码目录、文件和函数嵌套生成导航树。
 * @param map 分析器生成的项目图；函数的 parentId 来自 AST，而不是同名匹配。
 */
export function projectTree(map: CodeMap): ReadingTree {
  const root: ReadingTree = {
    id: "project",
    label: map.root.split("/").pop() || map.root,
    kind: "directory",
    children: [],
  };
  for (const module of map.nodes
    .filter((n) => n.kind === "module")
    .sort((a, b) => a.name.localeCompare(b.name))) {
    let parent = root;
    const parts = module.name.split("/");
    for (const part of parts.slice(0, -1)) {
      let dir = parent.children.find(
        (n) => n.kind === "directory" && n.label === part,
      );
      if (!dir) {
        dir = {
          id: `${parent.id}/${part}`,
          label: part,
          kind: "directory",
          children: [],
        };
        parent.children.push(dir);
      }
      parent = dir;
    }
    const file: ReadingTree = {
      id: module.id,
      symbolId: module.id,
      label: parts.at(-1)!,
      kind: "module",
      line: 1,
      children: [],
    };
    const fns = map.nodes.filter(
      (n) => n.kind === "function" && n.file === module.file,
    );
    const byId = new Map<string, ReadingTree>();
    for (const fn of fns)
      byId.set(fn.id, {
        id: fn.id,
        symbolId: fn.id,
        label: fn.name,
        kind: "function",
        line: fn.line,
        children: [],
      });
    for (const fn of fns) {
      ((fn.parentId && byId.get(fn.parentId)) || file).children.push(
        byId.get(fn.id)!,
      );
    }
    parent.children.push(file);
  }
  return root;
}

/** 按入口类型组织阅读起点；读子函数时保留原入口路径。
 * @param map 项目图及其入口证据。每个入口各自展开调用树，并限制总节点数。
 */
export function entryTree(map: CodeMap): ReadingTree {
  const root: ReadingTree = {
    id: "entries",
    label: "逻辑入口",
    kind: "directory",
    children: [],
  };
  const groups = {
    startup: "模块初始化",
    callback: "回调注册 · 候选",
    export: "导出 API",
    candidate: "无直接调用方 · 候选",
  } as const;
  let remaining = 1600;
  for (const [kind, label] of Object.entries(groups)) {
    const entries = (map.entries ?? [])
      .filter((e) => e.kind === kind)
      .sort((a, b) => a.label.localeCompare(b.label));
    if (!entries.length) continue;
    const group: ReadingTree = {
      id: `entries:${kind}`,
      label,
      kind: "directory",
      children: [],
    };
    for (const [index, entry] of entries.entries()) {
      if (group.children.length >= 40 || remaining <= 0) {
        group.truncated = true;
        break;
      }
      const tree = relationTree(
        map,
        entry.symbolId,
        "call",
        3,
        Math.min(60, remaining),
      );
      const prefix = `entry:${kind}:${index}:`;
      const namespace = (node: ReadingTree) => {
        node.id = prefix + node.id;
        remaining--;
        node.children.forEach(namespace);
      };
      namespace(tree);
      tree.label = entry.label;
      tree.reason = entry.reason;
      tree.candidate = entry.candidate;
      tree.evidence = { file: entry.file, line: entry.line };
      group.children.push(tree);
    }
    root.children.push(group);
  }
  return root;
}

/** 组装一次阅读快照，供小窗口、大工作台和不同宿主共同显示。
 * @param map 当前版本的符号与关系图，用来生成双树、调用者和定义跳转目标。
 * @param sources 文件路径到完整源码的映射；编辑器读取整份文件，片段只用于轻量工具输出。
 * @param revision 源码快照的版本哈希，跳转与解释发布时用它防止引用旧位置。
 * @param id 想阅读的符号 ID；未指定时选择第一个函数或模块。
 */
export function readerView(
  map: CodeMap,
  sources: Record<string, string>,
  revision: string,
  id?: string,
): ReaderView {
  const selected =
    map.nodes.find((n) => n.id === id) ??
    map.nodes.find((n) => n.kind === "function") ??
    map.nodes[0];
  const lines = selected
    ? (sources[selected.file] ?? "")
        .split(/\r?\n/)
        .slice(selected.line - 1, selected.endLine)
    : [];
  const source = lines.slice(0, 160).join("\n");
  const text = selected ? (sources[selected.file] ?? "") : "";
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  return {
    revision,
    generatedAt: map.generatedAt,
    root: map.root,
    project: projectTree(map),
    entries: entryTree(map),
    selected,
    source: source.slice(0, 24000),
    sourceTruncated: lines.length > 160 || source.length > 24000,
    calls: selected
      ? relationTree(
          map,
          selected.id,
          selected.kind === "module" ? "import" : "call",
        )
      : undefined,
    file: selected
      ? {
          path: selected.file,
          moduleId: map.nodes.find(
            (n) => n.kind === "module" && n.file === selected.file,
          )!.id,
          text,
          lineCount: text.split(/\r?\n/).length,
          symbols: map.nodes.filter(
            (n) => n.file === selected.file && n.kind === "function",
          ),
          references: (map.references ?? [])
            .filter((r) => r.file === selected.file && byId.has(r.targetId))
            .map((r) => {
              const n = byId.get(r.targetId)!;
              return {
                from: r.from,
                to: r.to,
                targetId: r.targetId,
                name: r.name ?? n.name,
                file: n.file,
                line: r.line ?? n.line,
                type: r.type,
                documentation: r.documentation,
              };
            }),
        }
      : undefined,
    callers: selected
      ? [
          ...new Set(
            map.edges
              .filter((e) => e.kind === "call" && e.target === selected.id)
              .map((e) => e.source),
          ),
        ]
          .map((id) => byId.get(id)!)
          .filter(Boolean)
          .map((n) => ({ id: n.id, name: n.name, file: n.file, line: n.line }))
      : [],
    warnings: map.warnings,
    unresolved: map.unresolved
      .filter((u) => u.owner === selected?.id)
      .slice(0, 80),
  };
}
