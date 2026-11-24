import { App } from "@modelcontextprotocol/ext-apps";
import { createReaderEditor } from "./editor.js";
import { installNavigation } from "./reader-navigation.js";
import { installModelSettings } from "./model-settings.js";
import {
  createElement,
  Search,
  FileCode,
  Folder,
  Braces,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  PanelRight,
  Expand,
  Minimize2,
  Pin,
  RefreshCw,
  X,
  ArrowUpRight,
  ListTree,
  Network,
  SquareCode,
  Sparkles,
  Sun,
  Moon,
  FoldVertical,
  CornerDownLeft,
  MapPin,
  Ellipsis,
} from "lucide";

const icons = {
  Search,
  FileCode,
  Folder,
  Braces,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  PanelRight,
  Expand,
  Minimize2,
  Pin,
  RefreshCw,
  X,
  ArrowUpRight,
  ListTree,
  Network,
  SquareCode,
  Sparkles,
  Sun,
  Moon,
  FoldVertical,
  CornerDownLeft,
  MapPin,
  Ellipsis,
};
const icon = (name, className = "") =>
  createElement(icons[name], {
    "aria-hidden": "true",
    class: `icon ${className}`,
    width: 16,
    height: 16,
    "stroke-width": 1.7,
  }).outerHTML;

const root = document.getElementById("app");
root.innerHTML = `
<header>
  <div class="brand"><span class="brand-mark">${icon("SquareCode")}</span><strong>Scanf</strong><span class="brand-caption">代码阅读空间</span></div>
  <button id="quick-open" aria-label="快速打开文件或符号" class="quick-open">${icon("Search")}<span>搜索文件、符号或行号…</span><kbd>Ctrl K</kbd></button>
  <div class="header-actions"><button id="theme" class="icon-button" aria-label="切换明暗主题" title="切换明暗主题">${icon("Moon")}</button><button id="pin" class="icon-button" aria-label="固定阅读位置" aria-pressed="false" title="固定阅读位置">${icon("Pin")}</button><button id="refresh" class="icon-button" aria-label="刷新项目" title="刷新项目">${icon("RefreshCw")}</button><details id="overflow-menu"><summary aria-label="更多操作" title="更多操作">${icon("Ellipsis")}</summary><div class="action-menu"><button id="menu-pin">固定阅读位置</button><button id="menu-refresh">刷新项目</button></div></details><span class="toolbar-divider"></span><button id="inspector-toggle" class="icon-button" aria-label="显示或隐藏代码说明" aria-pressed="false" title="代码说明">${icon("PanelRight")}</button><button id="mode" class="primary-button" aria-pressed="false">${icon("Expand")}<span>展开工作台</span></button></div>
</header>
<div id="warnings"></div>
<div class="reader-layout">
  <nav aria-label="代码导航">
    <div class="nav-heading"><span>EXPLORER</span><button id="collapse-tree" class="icon-button" title="折叠所有节点" aria-label="折叠所有节点">${icon("FoldVertical")}</button></div>
    <div class="view-tabs"><button id="project-tab" aria-pressed="true">${icon("ListTree")}文件结构</button><button id="entries-tab" aria-pressed="false">${icon("Network")}逻辑入口</button></div>
    <div class="tree-search">${icon("Search")}<input id="tree-filter" type="search" aria-label="筛选文件或入口" placeholder="筛选当前导航…"></div>
    <p id="tree-hint"></p><div id="tree"></div>
    <div class="nav-note">${icon("MapPin")}<span>从结构出发，沿逻辑阅读</span></div>
  </nav>
  <div id="sidebar-resize" role="separator" aria-label="调整导航栏宽度" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="420" aria-valuenow="250" tabindex="0"></div>
  <section class="code-pane" aria-label="代码阅读区">
    <div class="file-tab-bar"><div id="file-tabs" aria-label="已打开的源码文件"></div><span class="readonly-badge">只读</span></div>
    <div class="editor-toolbar"><div class="editor-navigation"><button id="back" class="icon-button" aria-label="后退" title="后退 Alt+←" disabled>${icon("ArrowLeft")}</button><button id="forward" class="icon-button" aria-label="前进" title="前进 Alt+→" disabled>${icon("ArrowRight")}</button><span class="toolbar-divider"></span><div id="location"></div></div><div class="editor-tools"><button id="find" class="icon-button" aria-label="查找代码" title="查找代码 Ctrl+F">${icon("Search")}</button><button id="definition" class="text-button" title="F12 / Ctrl+单击">${icon("ArrowUpRight")}<span>定义</span></button><button id="goto" class="text-button" title="跳到行 Ctrl+G">: <span>行号</span></button><button id="navigate" class="text-button" title="在宿主编辑器中打开">${icon("ArrowUpRight")}<span>编辑器打开</span></button></div></div>
    <div id="source" aria-label="源码编辑器"></div>
    <div id="context-bar"><span id="context-range"></span><button id="more-context" class="text-button">展开上下文 <span>+40</span></button><button id="full-file" class="text-button">完整文件 ${icon("ArrowUpRight")}</button></div>
  </section>
  <button id="inspector-scrim" hidden tabindex="-1" aria-label="关闭代码说明"></button>
  <aside id="inspector" hidden aria-label="代码说明">
    <div class="inspector-topline"><span>${icon("Sparkles")}代码透镜</span><button id="close-inspector" class="icon-button" aria-label="关闭说明">${icon("X")}</button></div>
    <div class="inspector-heading"><span class="symbol-mark">${icon("Braces")}</span><div><span id="symbol-kind" class="eyebrow">FUNCTION</span><h1 id="name">选择一个函数</h1></div></div>
    <p id="summary"></p>
    <div class="reading-tabs"><button id="source-tab" aria-pressed="true">用途与参数</button><button id="steps-tab" aria-pressed="false">逻辑步骤</button></div>
    <div id="details-body"><section id="explanation" hidden><h2>${icon("Sparkles")}Agent 解读</h2><p></p><small></small></section><section id="parameters"><h2>参数与用途 <span id="parameter-count"></span></h2><div></div></section><details id="entry-reason"><summary>入口识别依据</summary><p></p></details><section id="callers"><h2>调用位置</h2><div></div></section><details id="relations"><summary>当前符号关系</summary><div id="relation-tree"></div></details><details id="unresolved"><summary>外部 / 未解析关系</summary><div></div></details></div>
    <div id="steps" hidden></div><div class="ask-container"><button id="ask">${icon("Sparkles")}准备参数解读提问</button><small>结合源码证据，让 Agent 继续解释</small></div>
  </aside>
</div>
<p id="feedback" role="status"></p>
<footer><span class="connection-dot"></span><span id="status" role="status">正在连接…</span><span class="footer-hints"><kbd>F12</kbd> 定义<span>·</span><kbd>Alt ←</kbd> 返回<span>·</span>悬停查看参数</span><button id="footer-search">${icon("Search")}<kbd>Ctrl K</kbd></button></footer>
<dialog id="command-dialog" aria-label="快速导航"><form id="line-form"><div class="command-input-wrap">${icon("Search")}<input id="command-input" aria-label="搜索文件、符号或行号" placeholder="搜索文件、函数，或输入 :行号" autocomplete="off" spellcheck="false"><button type="button" id="close-command" aria-label="关闭快速导航"><kbd>Esc</kbd></button></div><input id="line-input" type="number" min="1" aria-label="跳到行号" hidden><div id="command-label" class="eyebrow">快速打开</div><div id="command-results" role="listbox" aria-label="导航结果"></div><div class="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>↵</kbd> 打开</span><span><kbd>:</kbd> 跳到行号</span></div></form></dialog>`;
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let view,
  treeMode = "project",
  mode = "compact",
  pinned = false,
  bridge,
  requestSerial = 0,
  inspectorOpen = false;
let contextRadius = 6,
  revealNext = true,
  targetLine;
const expanded = new Set(["project", "entries"]),
  files = new Map(),
  back = [],
  forward = [];
let initializedRoot, lastTreeSelection;
let allFilesClosed = false;
const status = (text) => {
  $("feedback").textContent = text;
};
const models = installModelSettings({ getBridge: () => bridge, icon, status });
const settingsButton = document.createElement("button");
settingsButton.id = "model-settings";
settingsButton.className = "icon-button";
settingsButton.title = "模型设置";
settingsButton.setAttribute("aria-label", "模型设置");
settingsButton.innerHTML = icon("Sparkles");
settingsButton.onclick = () => models.open();
document.querySelector(".header-actions").prepend(settingsButton);
const explainButton = document.createElement("button");
explainButton.id = "model-explain";
explainButton.className = "primary-button";
explainButton.innerHTML = icon("Sparkles") + "模型解读";
$("summary").after(explainButton);
explainButton.onclick = async () => {
  if (!view?.selected) return;
  if (!models.get()?.configured) {
    await models.open();
    return;
  }
  explainButton.disabled = true;
  status("");
  const currentView = view;
  try {
    const answer = await models.call("explain", {
      id: currentView.selected.id,
      revision: currentView.revision,
      line: currentView.selected.line,
    });
    if (
      allFilesClosed ||
      view.revision !== currentView.revision ||
      view.selected.id !== currentView.selected.id
    )
      return;
    $("explanation").hidden = false;
    $("explanation").querySelector("h2").innerHTML =
      icon("Sparkles") + "模型解读";
    $("explanation").querySelector("p").textContent = answer.text;
    $("explanation").querySelector("small").textContent =
      "自选模型解读 · 请结合源码核对";
    showInspector(true);
  } catch (error) {
    status(String(error));
  } finally {
    explainButton.disabled = false;
  }
};
const editor = createReaderEditor($("source"), {
  getModelConfig: () => models.get(),
  onModelSettings: () => models.open(),
  onExplain: async (line, manual = false) => {
    const snapshot = view;
    const node =
      snapshot.file?.symbols
        .filter((n) => n.line <= line && n.endLine >= line)
        .sort((a, b) => a.endLine - a.line - (b.endLine - b.line))[0] ??
      snapshot.selected;
    const answer = await models.call("hover", {
      id: node.id,
      revision: snapshot.revision,
      line,
      manual,
    });
    if (
      view.revision !== snapshot.revision ||
      view.file?.path !== snapshot.file?.path
    )
      throw new Error("阅读位置已变化，请重新悬停。");
    return answer.text;
  },
  onInspect: (id, options) => inspect(id, options),
  onCursor: (id) => inspect(id, { fromEditor: true }),
  onStatus: status,
});
const emptyEditor = document.createElement("div");
emptyEditor.id = "editor-empty";
emptyEditor.hidden = true;
emptyEditor.innerHTML = `<span class="empty-editor-icon">${icon("FileCode")}</span><strong>选择文件开始阅读</strong><span>从左侧导航打开源码，或搜索文件与符号。</span><button id="empty-quick-open" class="text-button">${icon("Search")}搜索项目 <kbd>Ctrl K</kbd></button>`;
$("source").after(emptyEditor);
$("empty-quick-open").onclick = () => $("quick-open").click();

function renderFileTabs(activePath) {
  $("file-tabs").innerHTML = [...files]
    .map(
      ([path, item]) =>
        `<div class="file-tab ${path === activePath ? "active" : ""}"><button title="${esc(item.label)}" class="file-tab-open ${path === activePath ? "selected" : ""}" data-file="${esc(path)}">${icon("FileCode")}<span>${esc(item.label.split("/").pop())}</span></button><button class="file-tab-close" data-close-file="${esc(path)}" title="关闭 ${esc(item.label)}" aria-label="关闭 ${esc(item.label)}">${icon("X")}</button></div>`,
    )
    .join("");
  $("file-tabs")
    .querySelectorAll("[data-file]")
    .forEach((el) => {
      el.onclick = () => inspect(files.get(el.dataset.file).id);
      el.onkeydown = (event) => {
        if (event.key === "Delete") {
          event.preventDefault();
          void closeFile(el.dataset.file, true);
        }
      };
    });
  $("file-tabs")
    .querySelectorAll("[data-close-file]")
    .forEach((el) => {
      el.onclick = (event) => {
        event.stopPropagation();
        void closeFile(el.dataset.closeFile, event.detail === 0);
      };
    });
  $("file-tabs")
    .querySelectorAll(".file-tab")
    .forEach((el) => {
      el.onauxclick = (event) => {
        if (event.button === 1) {
          event.preventDefault();
          void closeFile(el.querySelector("[data-file]").dataset.file);
        }
      };
      el.onmousedown = (event) => {
        if (event.button === 1) event.preventDefault();
      };
    });
}
async function closeFile(path, focusTab = false) {
  if (!files.has(path)) return;
  const paths = [...files.keys()],
    index = paths.indexOf(path);
  const active = !allFilesClosed && view.file?.path === path;
  try {
    if (active && paths.length > 1) {
      const neighbor = files.get(paths[index + 1] ?? paths[index - 1]);
      const request = ++requestSerial;
      const next = await bridge.inspect(neighbor.id, view.revision);
      if (request !== requestSerial) return;
      files.delete(path);
      contextRadius = 6;
      targetLine = undefined;
      receive(next);
    } else {
      files.delete(path);
      if (active) {
        allFilesClosed = true;
        ++requestSerial;
        targetLine = undefined;
        showInspector(false);
      }
      revealNext = false;
      render();
    }
    status("");
    if (focusTab) {
      const tabs = [...$("file-tabs").querySelectorAll("[data-file]")];
      (tabs[Math.min(index, tabs.length - 1)] ?? $("empty-quick-open")).focus();
    }
  } catch (error) {
    status(String(error));
  }
}
function treeRow(tree, depth = 0) {
  const open = expanded.has(tree.id) || depth === 0;
  const suffix =
    tree.reference === "cycle"
      ? " ↩ 递归"
      : tree.reference === "shared"
        ? " ↗ 共享引用"
        : tree.truncated
          ? " … 已截断"
          : "";
  const label = `${tree.label}${suffix}`;
  const evidence = tree.evidence
    ? ` · ${tree.evidence.file}:${tree.evidence.line}`
    : "";
  const title = esc((tree.reason ?? "") + evidence),
    selected = !allFilesClosed && view.selected?.id === tree.symbolId;
  const glyph =
    tree.kind === "function"
      ? "Braces"
      : tree.kind === "module"
        ? "FileCode"
        : tree.symbolId
          ? "Network"
          : "Folder";
  const content = `${icon(glyph, `node-icon node-${tree.kind}`)}<span class="tree-label">${esc(label)}</span>${tree.line ? ` <small>L${tree.line}</small>` : ""}`;
  if (!tree.children.length)
    return `<li>${tree.symbolId ? `<button title="${title || esc(tree.label)}" class="tree-symbol ${selected ? "selected" : ""}" data-symbol="${esc(tree.symbolId)}">${content}</button>` : `<span class="tree-group">${content}</span>`}</li>`;
  return `<li><details data-tree-key="${esc(tree.id)}" ${open ? "open" : ""}><summary title="${title || esc(tree.label)}" class="tree-parent ${selected ? "selected" : ""}" ${tree.symbolId ? `data-symbol="${esc(tree.symbolId)}"` : ""}><span class="tree-chevron">${icon("ChevronRight")}</span>${content}</summary><ul>${tree.children.map((child) => treeRow(child, depth + 1)).join("")}</ul></details></li>`;
}
function filterTree(tree, query) {
  if (
    !query ||
    `${tree.label} ${tree.reason ?? ""}`.toLowerCase().includes(query)
  )
    return tree;
  const children = tree.children
    .map((n) => filterTree(n, query))
    .filter(Boolean);
  return children.length ? { ...tree, children } : undefined;
}
function revealTreePath(tree, symbolId, parents = []) {
  if (tree.symbolId === symbolId) {
    parents.forEach((id) => expanded.add(id));
    return true;
  }
  return tree.children.some((child) =>
    revealTreePath(child, symbolId, [...parents, tree.id]),
  );
}
function bindTree(container) {
  container.querySelectorAll("details").forEach(
    (el) =>
      (el.ontoggle = () => {
        if (el.open) expanded.add(el.dataset.treeKey);
        else expanded.delete(el.dataset.treeKey);
      }),
  );
  container.querySelectorAll("[data-symbol]").forEach(
    (el) =>
      (el.onclick = (event) => {
        if (el.tagName === "SUMMARY") {
          if (event.target.closest(".tree-chevron")) return;
          event.preventDefault();
          el.parentElement.open = true;
        }
        inspect(el.dataset.symbol);
      }),
  );
}
function showInspector(open) {
  inspectorOpen = open;
  $("inspector").hidden = !open;
  $("inspector-scrim").hidden = !open;
  $("inspector-toggle").setAttribute("aria-pressed", String(open));
  root.classList.toggle("has-inspector", open);
}
function render() {
  if (!view) return;
  if (initializedRoot !== view.root) {
    view.project.children.forEach((n) => expanded.add(n.id));
    view.entries?.children.forEach((n) => expanded.add(n.id));
    initializedRoot = view.root;
    files.clear();
    allFilesClosed = false;
  }
  const n = allFilesClosed ? undefined : view.selected,
    file = allFilesClosed ? undefined : view.file;
  root.dataset.mode = mode;
  $("status").textContent =
    `${view.root.split("/").pop()} · 工作区源码 · ${view.revision.slice(0, 8)}${pinned ? " · 已固定" : ""}`;
  $("warnings").textContent = view.warnings.join(" ");
  const tree = treeMode === "project" ? view.project : view.entries;
  const treeSelection = `${view.root}:${treeMode}:${n?.id}`;
  const revealTree = treeSelection !== lastTreeSelection;
  if (revealTree && tree) revealTreePath(tree, n?.id);
  lastTreeSelection = treeSelection;
  const filtered =
    tree && filterTree(tree, $("tree-filter").value.trim().toLowerCase());
  $("tree").innerHTML = filtered
    ? `<ul>${treeRow(filtered)}</ul>`
    : "<p>没有匹配的文件或入口。</p>";
  if ($("tree-filter").value.trim())
    $("tree")
      .querySelectorAll("details")
      .forEach((el) => (el.open = true));
  if (treeMode === "project" && !view.project.children.length)
    $("tree").innerHTML =
      '<p class="empty">当前项目没有找到 TS / JS 源文件。请在宿主中切换到要阅读的项目文件夹。</p>';
  bindTree($("tree"));
  if (revealTree)
    $("tree").querySelector(".selected")?.scrollIntoView({ block: "nearest" });
  $("project-tab").setAttribute("aria-pressed", String(treeMode === "project"));
  $("entries-tab").setAttribute("aria-pressed", String(treeMode === "entries"));
  $("tree-hint").textContent =
    treeMode === "project"
      ? "目录 / 文件 / 函数"
      : "入口 → 静态调用；候选用途需确认";
  $("location").textContent = n
    ? `${n.file.startsWith(view.root + "/") ? n.file.slice(view.root.length + 1) : n.file}  ›  ${n.name}  ·  L${n.line}–${n.endLine}`
    : "";
  $("name").textContent =
    n?.name ?? (allFilesClosed ? "选择文件开始阅读" : "没有 TS / JS 源码");
  $("symbol-kind").textContent =
    n?.kind === "module" ? "SOURCE FILE" : "FUNCTION";
  $("parameter-count").textContent = String(n?.parameterDetails?.length ?? 0);
  $("summary").textContent =
    n?.documentation ||
    (n?.kind === "module"
      ? "当前为完整源码文件。点击函数体、树节点或调用位置查看逻辑。"
      : "这里保留源码原文。参数说明基于注释和实际用法；完整用途可由当前 Agent 补充。");
  $("explanation").hidden = !n || !view.explanation;
  if (view.explanation) {
    $("explanation").querySelector("h2").innerHTML =
      icon("Sparkles") + "Agent 解读";
    $("explanation").querySelector("p").textContent = view.explanation.text;
    $("explanation").querySelector("small").textContent =
      "源码引用：" +
      view.explanation.evidence
        .map((e) => `L${e.line}–${e.endLine}`)
        .join("、");
  }
  $("parameters").querySelector("div").innerHTML =
    (n?.parameterDetails ?? [])
      .map((p) => {
        const note = view.explanation?.parameters?.find(
          (n) => n.name === p.name,
        );
        const evidence = note?.evidence ?? p.uses;
        return `<article class="parameter"><div class="parameter-heading"><button class="parameter-name" title="定位参数及其引用" data-parameter="${esc(p.name)}">${esc(p.name)}${p.optional ? " <small>可选</small>" : ""}</button><small class="provenance">${note ? "Agent 解读" : p.descriptionSource === "comment" ? "源码注释" : p.descriptionSource === "usage" ? "源码用法" : "待补充"}</small></div><code>${esc(p.type)}</code>${p.defaultValue !== undefined ? `<small>默认值 ${esc(p.defaultValue)}</small>` : ""}<p>${esc(note?.text ?? p.description)}</p><div class="parameter-evidence"><span>源码</span>${evidence
          .slice(0, 4)
          .map(
            (e) =>
              `<button title="${esc((e.role ? e.role + "：" : "") + (e.text ?? "源码引用"))}" data-line="${e.line}">L${e.line}${icon("ArrowUpRight")}</button>`,
          )
          .join("")}</div></article>`;
      })
      .join("") ||
    '<p class="empty">' +
      (n?.kind === "module" ? "选择一个函数以查看参数。" : "此函数没有参数。") +
      "</p>";
  $("parameters")
    .querySelectorAll("[data-parameter]")
    .forEach(
      (el) => (el.onclick = () => editor.focusParameter(el.dataset.parameter)),
    );
  $("parameters")
    .querySelectorAll("[data-line]")
    .forEach((el) => (el.onclick = () => goLine(Number(el.dataset.line))));
  const reasons = [];
  const collect = (t) => {
    if (t.symbolId === n?.id && t.reason) reasons.push(t.reason);
    t.children.forEach(collect);
  };
  if (view.entries) collect(view.entries);
  $("entry-reason").hidden = !reasons.length;
  $("entry-reason").querySelector("p").textContent = [...new Set(reasons)].join(
    "\n",
  );
  $("callers").querySelector("div").innerHTML =
    (n ? (view.callers ?? []) : [])
      .map(
        (c) =>
          `<button data-symbol="${esc(c.id)}">${icon("Braces")}<span>${esc(c.name)} <small>${esc(c.file.slice(view.root.length + 1))}:${c.line}</small></span>${icon("ArrowUpRight")}</button>`,
      )
      .join("") || '<p class="empty">当前扫描范围未找到直接调用方。</p>';
  $("callers")
    .querySelectorAll("[data-symbol]")
    .forEach((el) => (el.onclick = () => inspect(el.dataset.symbol)));
  $("relation-tree").innerHTML =
    n && view.calls ? `<ul>${treeRow(view.calls)}</ul>` : "";
  bindTree($("relation-tree"));
  $("relations").querySelector("summary").textContent =
    n?.kind === "module" ? "导入依赖" : "调用了哪些函数";
  $("unresolved").hidden = !n;
  $("unresolved").querySelector("summary").textContent =
    `外部 / 未解析关系（${view.unresolved.length}）`;
  $("unresolved").querySelector("div").textContent = view.unresolved
    .map((u) => `${u.label} · L${u.line}`)
    .join("\n");
  $("steps").innerHTML =
    (n?.steps ?? [])
      .map(
        (s) =>
          `<button class="step depth-${Math.min(s.depth, 3)}" data-line="${s.line}"><span>${esc(s.kind)} · L${s.line}</span><code>${esc(s.text)}</code></button>`,
      )
      .join("") +
    (n?.stepsTruncated
      ? "<p>步骤摘要仅显示前 80 项；完整源码仍可阅读。</p>"
      : "");
  $("steps")
    .querySelectorAll("[data-line]")
    .forEach((el) => (el.onclick = () => goLine(Number(el.dataset.line))));
  if (file) {
    files.set(file.path, {
      id: n.id,
      label: file.path.slice(view.root.length + 1),
    });
    const start =
      mode === "workspace" || n?.kind === "module"
        ? 1
        : Math.max(1, (targetLine ?? n.line) - contextRadius);
    const end =
      mode === "workspace" || n?.kind === "module"
        ? file.lineCount
        : Math.min(
            file.lineCount,
            Math.max(targetLine ?? n.line, Math.min(n.endLine, n.line + 70)) +
              contextRadius,
          );
    editor.setData(file, n, { start, end }, view.explanation, {
      reveal: revealNext,
    });
    if (targetLine !== undefined) {
      editor.goToLine(targetLine);
      targetLine = undefined;
    }
    $("context-range").textContent =
      `${mode === "workspace" ? "完整文件" : "代码预览"} · ${start}–${end} / ${file.lineCount} 行`;
    $("more-context").hidden = start === 1 && end === file.lineCount;
    $("full-file").hidden = mode === "workspace";
  } else {
    editor.clear();
    $("context-range").textContent = "未打开文件";
    $("more-context").hidden = $("full-file").hidden = true;
  }
  renderFileTabs(file?.path);
  $("source").hidden = !file;
  $("editor-empty").hidden = !!file;
  for (const id of [
    "find",
    "definition",
    "goto",
    "navigate",
    "ask",
    "model-explain",
  ])
    $(id).disabled = !file;
  $("navigate").hidden = !bridge?.navigate;
  $("back").disabled = !back.length;
  $("forward").disabled = !forward.length;
  $("ask").innerHTML =
    icon("Sparkles") +
    (bridge?.ask ? "请 Agent 解释用途与参数" : "准备参数解读提问");
  $("mode").innerHTML =
    icon(mode === "compact" ? "Expand" : "Minimize2") +
    `<span>${mode === "compact" ? "展开工作台" : "返回小窗口"}</span>`;
  $("mode").title =
    mode === "compact" ? "展开完整源码与说明" : "返回树与代码预览";
  $("mode").setAttribute("aria-pressed", String(mode === "workspace"));
  revealNext = true;
}
function receive(next, fromSelection = false) {
  if (pinned && fromSelection) {
    status("已固定阅读位置。");
    return;
  }
  if (fromSelection) allFilesClosed = false;
  view = next;
  render();
}
function current() {
  return !allFilesClosed && view?.selected
    ? { id: view.selected.id, line: editor.getCursorLine() }
    : undefined;
}
async function inspect(id, { fromEditor = false, history = true, line } = {}) {
  if (!view || !bridge) return;
  const request = ++requestSerial,
    previous = current();
  try {
    const next = await bridge.inspect(id, view.revision);
    if (request !== requestSerial) return;
    if (history && previous && previous.id !== id) {
      back.push(previous);
      forward.length = 0;
    }
    revealNext = !fromEditor;
    targetLine = line;
    contextRadius = 6;
    allFilesClosed = false;
    status("");
    receive(next);
  } catch (error) {
    status(String(error));
  }
}
async function moveHistory(direction) {
  const from = direction === "back" ? back : forward,
    to = direction === "back" ? forward : back;
  const target = from.at(-1);
  if (!target) return;
  const previous = current();
  try {
    const next = await bridge.inspect(target.id, view.revision);
    from.pop();
    if (previous) to.push(previous);
    targetLine = target.line;
    allFilesClosed = false;
    receive(next);
  } catch (error) {
    status(String(error));
  }
}
function goLine(line) {
  if (!view?.file || allFilesClosed) return;
  line = Math.max(1, Math.min(view.file.lineCount, line));
  targetLine = line;
  render();
  editor.goToLine(line);
}
async function setMode(next) {
  mode = next;
  showInspector(next === "workspace");
  render();
  const hostAction = next === "workspace" ? bridge?.expand : bridge?.compact;
  if (hostAction)
    try {
      await hostAction();
    } catch (error) {
      status("阅读模式已切换；宿主窗口未能调整：" + String(error));
    }
}
function prompt() {
  const n = view.selected;
  return `请结合完整文件解释 ${n.file} 中的 ${n.name}（L${n.line}–${n.endLine}，版本 ${view.revision}）：它解决什么问题；逐个说明参数的业务含义、来源和去向；解释调用与异常路径。使用 scanf_publish_explanation 发布用途和 parameters 数组，每个说明附源码行号。无法确定的业务含义请明确标为推断。`;
}
$("pin").onclick = () => {
  pinned = !pinned;
  $("pin").setAttribute("aria-pressed", String(pinned));
  $("pin").title = pinned ? "取消固定阅读位置" : "固定阅读位置";
  $("menu-pin").textContent = pinned ? "取消固定阅读位置" : "固定阅读位置";
  render();
};
$("project-tab").onclick = () => {
  treeMode = "project";
  revealNext = false;
  render();
};
$("entries-tab").onclick = () => {
  treeMode = "entries";
  revealNext = false;
  render();
};
$("tree-filter").oninput = () => {
  revealNext = false;
  render();
};
$("mode").onclick = () => setMode(mode === "compact" ? "workspace" : "compact");
$("full-file").onclick = () => setMode("workspace");
$("more-context").onclick = () => {
  contextRadius += 40;
  revealNext = false;
  render();
};
$("inspector-toggle").onclick = () => showInspector(!inspectorOpen);
$("close-inspector").onclick = () => showInspector(false);
$("inspector-scrim").onclick = () => showInspector(false);
$("source-tab").onclick = () => {
  $("details-body").hidden = false;
  $("steps").hidden = true;
  $("source-tab").setAttribute("aria-pressed", "true");
  $("steps-tab").setAttribute("aria-pressed", "false");
};
$("steps-tab").onclick = () => {
  showInspector(true);
  $("details-body").hidden = true;
  $("steps").hidden = false;
  $("source-tab").setAttribute("aria-pressed", "false");
  $("steps-tab").setAttribute("aria-pressed", "true");
};
$("back").onclick = () => moveHistory("back");
$("forward").onclick = () => moveHistory("forward");
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    !event.defaultPrevented &&
    !$("command-dialog").open &&
    inspectorOpen
  ) {
    showInspector(false);
    $("inspector-toggle").focus();
  }
  if (
    event.altKey &&
    (event.key === "ArrowLeft" || event.key === "ArrowRight")
  ) {
    event.preventDefault();
    moveHistory(event.key === "ArrowLeft" ? "back" : "forward");
  }
});
$("find").onclick = () => editor.search();
$("definition").onclick = () => editor.definition();
installNavigation({ root, getView: () => view, inspect, goLine, icon, esc });
$("collapse-tree").onclick = () => {
  expanded.clear();
  $("tree")
    .querySelectorAll("details")
    .forEach((node) => {
      node.open = false;
    });
};
let theme;
try {
  theme = localStorage.getItem("scanf-theme");
} catch {}
function applyTheme() {
  document.documentElement.dataset.theme = theme || "auto";
  const dark =
    theme === "dark" ||
    (!theme && matchMedia("(prefers-color-scheme: dark)").matches);
  $("theme").innerHTML = icon(dark ? "Sun" : "Moon");
  $("theme").title = dark ? "切换为浅色主题" : "切换为深色主题";
  $("theme").setAttribute("aria-label", $("theme").title);
}
$("theme").onclick = () => {
  theme =
    (theme ||
      (matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light")) === "dark"
      ? "light"
      : "dark";
  try {
    localStorage.setItem("scanf-theme", theme);
  } catch {}
  applyTheme();
};
applyTheme();
$("navigate").onclick = async () => {
  try {
    await bridge.navigate(
      view.file.moduleId,
      editor.getCursorLine(),
      view.revision,
    );
  } catch (error) {
    status(String(error));
  }
};
$("ask").onclick = async () => {
  if (!view?.selected) return;
  try {
    if (bridge.ask) {
      await bridge.ask(prompt());
      status("已发送用途与参数解读请求。");
    } else status(prompt());
  } catch (error) {
    status(prompt() + "\n" + String(error));
  }
};
$("refresh").onclick = async () => {
  try {
    const next = await bridge.refresh();
    back.length = forward.length = 0;
    receive(next);
  } catch (error) {
    status(String(error));
  }
};
for (const action of ["pin", "refresh"]) {
  $("menu-" + action).onclick = () => {
    $(action).click();
    $("overflow-menu").open = false;
  };
}
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest("#overflow-menu")) $("overflow-menu").open = false;
});
let hostCapabilities = [],
  parentSequence = 0;
const parentPending = new Map();
const parentRequest = (action, payload = {}) =>
  new Promise((resolve, reject) => {
    const requestId = ++parentSequence;
    const timer = setTimeout(() => {
      parentPending.delete(requestId);
      reject(new Error("宿主请求超时"));
    }, 5000);
    parentPending.set(requestId, { resolve, reject, timer });
    window.parent.postMessage(
      { type: "scanf:request", action, requestId, ...payload },
      "*",
    );
  });
function attachParent() {
  if (!bridge) return;
  if (hostCapabilities.includes("expand"))
    bridge.expand = () => parentRequest("expand");
  if (hostCapabilities.includes("compact"))
    bridge.compact = () => parentRequest("compact");
  if (hostCapabilities.includes("navigate"))
    bridge.navigate = (id, line, revision) =>
      parentRequest("navigate", { file: view.file.path, line, revision });
}
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const data = event.data;
  if (data?.type === "scanf:host") {
    hostCapabilities = data.capabilities ?? [];
    attachParent();
    if (view) render();
  }
  if (data?.type === "scanf:response") {
    const job = parentPending.get(data.requestId);
    if (job) {
      clearTimeout(job.timer);
      parentPending.delete(data.requestId);
      data.error ? job.reject(new Error(data.error)) : job.resolve(data.result);
    }
  }
});
async function start() {
  if (typeof acquireVsCodeApi === "function") {
    const vscode = acquireVsCodeApi();
    let seq = 0;
    const pending = new Map();
    const request = (type, payload = {}) =>
      new Promise((resolve, reject) => {
        const requestId = ++seq;
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("编辑器请求超时"));
        }, 35000);
        pending.set(requestId, { resolve, reject, timer });
        vscode.postMessage({ type, ...payload, requestId });
      });
    bridge = {
      model: (operation, payload) => request("model", { operation, payload }),
      inspect: (id, revision) => request("inspect", { id, revision }),
      refresh: () => request("refresh"),
      navigate: (id, line, revision) =>
        request("navigate", { id, line, revision }),
      expand: () => request("expand"),
    };
    window.addEventListener("message", ({ data }) => {
      if (data.requestId && pending.has(data.requestId)) {
        const job = pending.get(data.requestId);
        clearTimeout(job.timer);
        pending.delete(data.requestId);
        data.error
          ? job.reject(new Error(data.error))
          : job.resolve(data.view ?? data.result);
      } else if (data.type === "view") receive(data.view, !!data.selection);
      else if (data.type === "error") status(data.message);
    });
    vscode.postMessage({ type: "ready" });
    void models.refresh();
  } else if (
    location.protocol === "http:" &&
    location.hostname === "127.0.0.1"
  ) {
    const key = "scanf-local-reader-token",
      token = location.hash.slice(1) || sessionStorage.getItem(key);
    if (!token || !/^[a-f0-9]{48}$/.test(token))
      throw new Error(
        "缺少本机连接令牌，请重新打开终端给出的完整地址（含 # 后内容）。",
      );
    sessionStorage.setItem(key, token);
    history.replaceState(null, "", location.pathname);
    const request = async (data) => {
      const response = await fetch("/api", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(35000),
      });
      if (response.status === 401) {
        sessionStorage.removeItem(key);
        throw new Error("连接令牌已失效，请重新打开本次服务启动时的完整地址。");
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "请求失败");
      return data.action === "model" ? result.result : result.view;
    };
    bridge = {
      model: (operation, payload) =>
        request({ action: "model", operation, payload }),
      inspect: (id, revision) => request({ action: "inspect", id, revision }),
      refresh: () => request({ action: "refresh" }),
    };
    attachParent();
    receive(await bridge.refresh());
    void models.refresh();
  } else {
    const app = new App({ name: "Scanf Reader", version: "0.6.1" }, {});
    app.ontoolresult = (result) => {
      if (result.structuredContent?.view)
        receive(result.structuredContent.view, true);
    };
    await app.connect();
    const call = async (name, args = {}) => {
      const result = await app.callServerTool({ name, arguments: args });
      if (result.isError)
        throw new Error(result.content?.map((c) => c.text ?? "").join("\n"));
      if (!result.structuredContent?.view) throw new Error("缺少阅读结果");
      return result.structuredContent.view;
    };
    bridge = {
      inspect: (id, revision) => call("scanf_inspect", { id, revision }),
      refresh: () => call("scanf_open_reader"),
      ask: (text) =>
        app.sendMessage({ role: "user", content: [{ type: "text", text }] }),
      expand: () => app.requestDisplayMode({ mode: "fullscreen" }),
    };
    if (!view) receive(await bridge.refresh());
    else render();
  }
}
root.dataset.mode = mode;
start().catch((error) => {
  $("status").textContent = `无法连接阅读工具：${error}`;
});
