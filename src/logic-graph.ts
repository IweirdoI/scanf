import { randomBytes } from "node:crypto";
import type { CodeMap, CodeNode } from "./model";
import type { ReaderView } from "./reader-model";

type Relation = "contains" | "call" | "incoming";
export interface GraphNode {
  key: number;
  id: string;
  name: string;
  file: string;
  line: number;
  relation: Relation;
  reference?: string;
  children: GraphNode[];
  x: number;
  y: number;
}
const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

/** A bounded reading tree: call direction and AST ownership are different edge types. */
export function graphModel(map: CodeMap, selectedId: string, depth = 2) {
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  const selected = byId.get(selectedId);
  if (!selected) return undefined;
  let budget = 60,
    key = 0,
    truncated = false;
  const seen = new Set<string>();
  const branch = (
    node: CodeNode,
    relation: Relation,
    level: number,
    ancestors: Set<string>,
  ): GraphNode => {
    budget--;
    const result: GraphNode = {
      key: key++,
      id: node.id,
      name: node.name,
      file: node.file.slice(map.root.length + 1),
      line: node.line,
      relation,
      children: [],
      x: 0,
      y: 0,
    };
    if (ancestors.has(node.id)) {
      result.reference = "递归";
      return result;
    }
    if (seen.has(node.id)) {
      result.reference = "共享引用";
      return result;
    }
    seen.add(node.id);
    const path = new Set([...ancestors, node.id]);
    const targets: Array<{ node: CodeNode; relation: Relation }> = [];
    // Ownership comes from AST parent IDs, never from calling a function.
    for (const child of map.nodes.filter(
      (child) =>
        child.kind === "function" &&
        (child.parentId === node.id ||
          (node.kind === "module" &&
            child.file === node.file &&
            !child.parentId)),
    ))
      targets.push({ node: child, relation: "contains" });
    const calls = new Set(
      map.edges
        .filter((edge) => edge.kind === "call" && edge.source === node.id)
        .map((edge) => edge.target),
    );
    for (const target of calls) {
      const called = byId.get(target);
      if (called) targets.push({ node: called, relation: "call" });
    }
    if (level >= depth) {
      if (targets.length) {
        truncated = true;
        result.reference = `还有 ${targets.length} 个关系`;
      }
      return result;
    }
    for (const target of targets) {
      if (budget <= 0) {
        truncated = true;
        break;
      }
      result.children.push(
        branch(target.node, target.relation, level + 1, path),
      );
    }
    return result;
  };
  const owner = selected.parentId
    ? byId.get(selected.parentId)
    : map.nodes.find(
        (node) => node.kind === "module" && node.file === selected.file,
      );
  const root = branch(selected, "contains", 0, new Set());
  // Keep the selected function's real owner visible, without expanding unrelated siblings.
  let tree = root;
  if (owner && owner.id !== selected.id)
    tree = {
      key: key++,
      id: owner.id,
      name: owner.name,
      file: owner.file.slice(map.root.length + 1),
      line: owner.line,
      relation: "contains",
      children: [root],
      x: 0,
      y: 0,
    };
  const callers = [
    ...new Set(
      map.edges
        .filter((edge) => edge.kind === "call" && edge.target === selected.id)
        .map((edge) => edge.source),
    ),
  ].slice(0, 6);
  for (const id of callers) {
    const caller = byId.get(id);
    if (caller && caller.id !== selected.id && budget > 0) {
      budget--;
      root.children.push({
        key: key++,
        id: caller.id,
        name: caller.name,
        file: caller.file.slice(map.root.length + 1),
        line: caller.line,
        relation: "incoming",
        children: [],
        x: 0,
        y: 0,
      });
    }
  }
  let leaf = 0,
    maxY = 0;
  const nodes: GraphNode[] = [],
    edges: Array<{ from: GraphNode; to: GraphNode }> = [];
  const layout = (node: GraphNode, level: number) => {
    node.y = level * 112 + 22;
    maxY = Math.max(maxY, node.y);
    if (!node.children.length) node.x = leaf++ * 208 + 16;
    else {
      node.children.forEach((child) => {
        layout(child, level + 1);
        edges.push({ from: node, to: child });
      });
      node.x = (node.children[0].x + node.children.at(-1)!.x) / 2;
    }
    nodes.push(node);
  };
  layout(tree, 0);
  return {
    nodes,
    edges,
    width: Math.max(232, leaf * 208 + 24),
    height: maxY + 98,
    truncated,
  };
}

export function graphHtml(
  map: CodeMap | undefined,
  view: ReaderView | undefined,
  choice: string,
  depth: number,
  message = "",
) {
  const nonce = randomBytes(18).toString("hex"),
    selectedId =
      choice ||
      view?.selected?.id ||
      map?.entries?.find((entry) => entry.kind === "startup")?.symbolId ||
      map?.entries?.[0]?.symbolId ||
      "";
  const graph = map ? graphModel(map, selectedId, depth) : undefined;
  const selected = map?.nodes.find((node) => node.id === selectedId);
  const entries = (map?.entries ?? []).filter(
    (entry, index, all) =>
      all.findIndex((other) => other.symbolId === entry.symbolId) === index,
  );
  const options = entries
    .map(
      (entry) =>
        `<option value="${esc(entry.symbolId)}" ${entry.symbolId === choice ? "selected" : ""}>${esc(entry.label)} · ${esc(entry.file.slice((map?.root.length ?? 0) + 1))}${entry.candidate ? " · 候选" : ""}</option>`,
    )
    .join("");
  const custom =
    choice && !entries.some((entry) => entry.symbolId === choice) && selected
      ? `<option value="${esc(choice)}" selected>${esc(selected.name)}</option>`
      : "";
  const links =
    graph?.edges
      .map(({ from, to }) => {
        const x1 = from.x + 92,
          y1 = from.y + 60,
          x2 = to.x + 92,
          y2 = to.y;
        return `<path class="edge ${to.relation}" d="M${x1} ${y1}V${y1 + 24}H${x2}V${y2}" ${to.relation === "call" ? 'marker-end="url(#call-arrow)"' : to.relation === "incoming" ? 'marker-start="url(#incoming-arrow)"' : ""}/><text class="edge-label ${to.relation}" x="${x2 + 6}" y="${y2 - 7}">${to.relation === "call" ? "调用 →" : to.relation === "incoming" ? "← 调用当前函数" : "包含"}</text>`;
      })
      .join("") ?? "";
  const cards =
    graph?.nodes
      .map(
        (node) =>
          `<button class="node ${node.id === selectedId ? "selected" : ""} ${node.relation}" style="left:${node.x}px;top:${node.y}px" data-id="${esc(node.id)}" data-line="${node.line}" title="${esc(node.name)}&#10;${esc(node.file)}:${node.line}"><span class="name">${esc(node.name)}</span><span class="file">${esc(node.file)}:${node.line}</span>${node.reference ? `<span class="reference">${esc(node.reference)}</span>` : ""}</button>`,
      )
      .join("") ?? "";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'nonce-${nonce}';style-src-attr 'unsafe-inline';script-src 'nonce-${nonce}'"><style nonce="${nonce}">
  *{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground,#d8dee9);background:var(--vscode-sideBar-background,#171a21);font:12px/1.5 var(--vscode-font-family,system-ui)}header{padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border,#353944)}.controls{display:flex;gap:6px;flex-wrap:wrap}select,button.tool{color:var(--vscode-input-foreground,#d8dee9);background:var(--vscode-input-background,#252a35);border:1px solid var(--vscode-input-border,#454c5d);border-radius:4px;padding:4px;max-width:100%;font:inherit}select#entry{flex:1;min-width:110px}button{cursor:pointer}button:focus-visible,select:focus-visible{outline:1px solid var(--vscode-focusBorder,#8c84ef)}.legend{display:flex;gap:12px;margin-top:8px;font-size:11px;color:var(--vscode-descriptionForeground,#a1a9b8)}.legend span:before{content:'';display:inline-block;width:15px;margin-right:4px;vertical-align:middle;border-top:2px solid #57c8b1}.legend .owns:before{border-top:2px dashed #ad9df7}.legend .caller:before{border-color:#dfb775}.hint{margin-top:6px;color:var(--vscode-descriptionForeground,#9ba5b7);font-size:11px}.viewport{overflow:auto;min-height:230px;max-height:70vh;position:relative;background-image:radial-gradient(var(--vscode-panel-border,#353944) .6px,transparent .6px);background-size:16px 16px}.canvas{position:relative;transform-origin:top left}.edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.edge{fill:none;stroke-width:1.8;stroke:#57c8b1}.edge.contains{stroke:#ad9df7;stroke-dasharray:4 3}.edge.incoming{stroke:#dfb775}.edge-label{font-size:10px;fill:#57c8b1}.edge-label.contains{fill:#ad9df7}.edge-label.incoming{fill:#dfb775}.node{position:absolute;width:184px;height:60px;text-align:left;display:flex;flex-direction:column;justify-content:center;padding:8px 10px;border-radius:7px;border:1px solid var(--vscode-panel-border,#454b59);background:var(--vscode-editor-background,#20242e);color:var(--vscode-foreground,#d8dee9);box-shadow:0 2px 8px #0002}.node:hover{border-color:var(--vscode-focusBorder,#9d90ef)}.node.selected{border-color:#a895f5;box-shadow:0 0 0 1px #a895f555;background:var(--vscode-list-inactiveSelectionBackground,#302d48)}.name{font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file{font-size:10px;opacity:.65;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reference{position:absolute;top:-10px;right:5px;font-size:9px;background:var(--vscode-sideBar-background,#171a21);color:var(--vscode-descriptionForeground,#aaa);padding:0 3px}.empty{padding:20px;color:var(--vscode-descriptionForeground,#aaa)}details{padding:6px 12px;font-size:11px;color:var(--vscode-descriptionForeground,#aaa)}summary{cursor:pointer}footer{padding:5px 12px;color:var(--vscode-descriptionForeground,#aaa);font-size:11px}
  </style></head><body><header><div class="controls"><select id="entry" aria-label="选择逻辑入口"><option value="">跟随当前函数</option>${custom}${options}</select><select id="depth" aria-label="展开层数">${[1, 2, 3].map((value) => `<option value="${value}" ${value === depth ? "selected" : ""}>${value} 层</option>`).join("")}</select><button class="tool" id="fit">适宽</button><button class="tool" id="actual">100%</button><button class="tool" id="expand" title="在源码旁展开大图">↗ 大图</button></div><div class="legend"><span>调用 →</span><span class="owns">包含</span><span class="caller">调用方 ←</span></div><div class="hint">${esc(selected?.name ?? "选择源码中的函数，或选择一个项目入口")} · 点击节点跳转源码</div></header>${message ? `<div class="empty" role="status">${esc(message)}</div>` : ""}${graph ? `<div class="viewport" id="viewport"><div id="sizer"><div class="canvas" id="canvas" style="width:${graph.width}px;height:${graph.height}px"><svg class="edges" width="${graph.width}" height="${graph.height}" aria-label="分叉关系连线"><defs><marker id="call-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8" fill="#57c8b1"/></marker><marker id="incoming-arrow" viewBox="0 0 8 8" refX="1" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L8 4L0 8" fill="#dfb775"/></marker></defs>${links}</svg>${cards}</div></div></div>` : `<p class="empty">文件夹与文件请在上方的 VS Code 资源管理器中打开。选择函数后，这里显示分叉关系图。</p>`}<footer>${graph?.truncated ? "已限制深度或节点数；点击子函数继续展开。" : "连线来自静态源码证据；不代表运行顺序。"}</footer>${map?.warnings.length ? `<details><summary>分析提示（${map.warnings.length}）</summary>${map.warnings.map((warning) => `<p>${esc(warning)}</p>`).join("")}</details>` : ""}<script nonce="${nonce}">
  const vscode=acquireVsCodeApi();const canvas=document.getElementById('canvas'),viewport=document.getElementById('viewport');let scale=1;function zoom(fit){if(!canvas)return;scale=fit?Math.max(.55,Math.min(1,(viewport.clientWidth-12)/${graph?.width ?? 1})):1;canvas.style.transform='scale('+scale+')';document.getElementById('sizer').style.width=(${graph?.width ?? 0}*scale)+'px';document.getElementById('sizer').style.height=(${graph?.height ?? 0}*scale)+'px';const selected=canvas.querySelector('.selected');if(selected)viewport.scrollLeft=Math.max(0,selected.offsetLeft*scale-viewport.clientWidth/2+92*scale);}zoom(false);document.getElementById('fit').onclick=()=>zoom(true);document.getElementById('actual').onclick=()=>zoom(false);document.getElementById('expand').onclick=()=>vscode.postMessage({type:'expand'});document.getElementById('entry').onchange=event=>vscode.postMessage({type:'choice',id:event.target.value});document.getElementById('depth').onchange=event=>vscode.postMessage({type:'depth',depth:Number(event.target.value)});document.querySelectorAll('[data-id]').forEach(button=>button.onclick=()=>vscode.postMessage({type:'navigate',id:button.dataset.id,line:Number(button.dataset.line),revision:${JSON.stringify(view?.revision ?? "")}}));</script></body></html>`;
}
