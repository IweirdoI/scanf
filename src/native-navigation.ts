import * as vscode from "vscode";
import type { ReaderView, ReadingTree } from "./reader-model";

/** Native tree only: file tabs, source editing, search and navigation remain in VS Code. */
export class LogicNavigation implements vscode.TreeDataProvider<ReadingTree> {
  private changed = new vscode.EventEmitter<ReadingTree | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  roots: ReadingTree[] = [];
  private parents = new Map<ReadingTree, ReadingTree>();
  private version = "";

  update(view?: ReaderView) {
    this.version = view?.revision ?? "";
    this.parents.clear();
    this.roots = [];
    if (view) {
      const current = view.selected;
      if (current) {
        const children: ReadingTree[] = [
          {
            id: "definition",
            label: "打开定义",
            kind: current.kind,
            children: [],
            symbolId: current.id,
            line: current.line,
          },
          {
            id: "outgoing",
            label: current.kind === "module" ? "导入依赖" : "调用了哪些函数",
            kind: "group",
            children: view.calls?.children ?? [],
          },
          {
            id: "incoming",
            label: "谁调用了它",
            kind: "group",
            children: (view.callers ?? []).map((c) => ({
              id: `caller:${c.id}`,
              label: c.name,
              kind: "function",
              symbolId: c.id,
              line: c.line,
              children: [],
              evidence: { file: c.file, line: c.line },
            })),
          },
        ];
        this.roots.push({
          id: "current",
          label: current.name,
          kind: "current",
          children,
        });
      }
      this.roots.push({ ...view.entries, label: "项目逻辑入口" });
      if (view.warnings.length)
        this.roots.push({
          id: "warnings",
          label: `分析提示（${view.warnings.length}）`,
          kind: "warning",
          children: view.warnings.map((label, i) => ({
            id: `warning:${i}`,
            label,
            kind: "warning",
            children: [],
          })),
        });
    }
    const collect = (node: ReadingTree) => {
      for (const child of node.children) {
        this.parents.set(child, node);
        collect(child);
      }
    };
    this.roots.forEach(collect);
    this.changed.fire(undefined);
  }
  getChildren(node?: ReadingTree) {
    return node ? node.children : this.roots;
  }
  getParent(node: ReadingTree) {
    return this.parents.get(node);
  }
  getTreeItem(node: ReadingTree) {
    const item = new vscode.TreeItem(
      node.label,
      node.children.length
        ? ["current", "entries"].includes(node.id)
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = node.id;
    item.contextValue = node.symbolId ? "scanf.symbol" : "scanf.group";
    item.description = node.reference
      ? node.reference === "cycle"
        ? "递归"
        : "共享"
      : node.line
        ? `L${node.line}${node.candidate ? " · 候选" : ""}`
        : undefined;
    item.tooltip = [
      node.reason,
      node.evidence ? `${node.evidence.file}:${node.evidence.line}` : undefined,
      node.truncated ? "已截断，请缩小分析范围。" : undefined,
      node.label,
    ]
      .filter(Boolean)
      .join("\n");
    item.iconPath = new vscode.ThemeIcon(
      node.kind === "warning"
        ? "warning"
        : node.kind === "current"
          ? "target"
          : node.symbolId
            ? "symbol-method"
            : "list-tree",
    );
    if (node.symbolId)
      item.command = {
        command: "scanf.navigate",
        title: "在编辑器中打开",
        arguments: [
          { id: node.symbolId, revision: this.version, line: node.line },
        ],
      };
    return item;
  }
  dispose() {
    this.changed.dispose();
  }
}
