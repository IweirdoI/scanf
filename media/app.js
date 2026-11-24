import dagre from '@dagrejs/dagre';

const vscode = acquireVsCodeApi();
const root = document.getElementById('app');
root.innerHTML = `<header><div class="brand"><span class="logo">S</span><div><strong>Scanf</strong><span class="subtitle">把代码，读成一张地图</span></div></div><div class="header-actions"><span id="status" role="status">等待分析</span><button id="refresh">重新分析</button></div></header>
<div id="notice" role="status"></div><div class="workspace"><aside class="navigator"><div class="eyebrow">SOURCE EXPLORER</div><h2>从一个入口开始</h2><input id="search" type="search" aria-label="搜索文件或函数" placeholder="搜索文件或函数…"><div id="stats"></div><div id="files"></div><p class="sidebar-note">结构来自本地源码<br>点击节点查看 · 双击跳转源码</p></aside>
<main><div class="toolbar"><div class="tabs" role="group" aria-label="地图类型"><button id="modules" class="active">模块地图</button><button id="calls">函数关系</button></div><button id="scope">只看相邻关系</button></div><div class="graph-title"><div><div class="eyebrow" id="graph-kicker">MODULE DEPENDENCIES</div><h1 id="graph-title">代码阅读地图</h1><p id="graph-description">正在提取源码结构…</p></div><span class="badge">静态分析</span></div><div id="graph-wrap"><svg id="graph" xmlns="http://www.w3.org/2000/svg" aria-label="交互式代码关系图"></svg><div id="empty"></div><div class="graph-tools"><button id="zoom-in" aria-label="放大">＋</button><button id="zoom-out" aria-label="缩小">−</button><button id="fit">适应画布</button></div></div><footer><span><i class="legend-dot"></i>当前节点</span><span>实线箭头 = 已解析关系</span><span id="graph-count"></span></footer></main>
<aside class="inspector"><div class="eyebrow">READING GUIDE</div><div id="details"><h2>从左侧选择一个函数</h2><p>在地图中定位，再沿着源码结构阅读。</p></div></aside></div>`;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let map, selected, mode = 'modules', focused = false, busy = false;
let box = {x:0,y:0,w:1000,h:700}, initialBox = {...box};
const nodeById = id => map?.nodes.find(n => n.id === id);
const rel = file => file.startsWith(map.root + '/') ? file.slice(map.root.length + 1) : file;
const navigate = (id, line) => vscode.postMessage({type:'navigate',id,line});

function select(id, fromEditor = false) {
  if (!nodeById(id)) return;
  selected = id;
  if (!fromEditor && nodeById(id).kind === 'function') mode = 'calls';
  render();
}
function renderList() {
  const query = $('search').value.toLowerCase();
  $('stats').textContent = `${map.nodes.filter(n => n.kind === 'module').length} 个文件 · ${map.nodes.filter(n => n.kind === 'function').length} 个函数`;
  const modules = map.nodes.filter(n => n.kind === 'module');
  $('files').innerHTML = modules.map(module => {
    const fns = map.nodes.filter(n => n.kind === 'function' && n.file === module.file);
    const matched = module.name.toLowerCase().includes(query);
    const visible = fns.filter(n => matched || n.name.toLowerCase().includes(query));
    if (!matched && !visible.length) return '';
    return `<section class="file-group"><button class="file ${selected === module.id ? 'selected' : ''}" data-id="${esc(module.id)}" title="${esc(module.name)}"><span class="file-icon">◇</span><span>${esc(module.name)}</span><small>${fns.length}</small></button>${visible.map(fn => `<button class="function ${selected === fn.id ? 'selected' : ''}" data-id="${esc(fn.id)}" title="${esc(fn.name)}"><span class="fn-icon">ƒ</span><span>${esc(fn.name)}</span><small>${fn.line}</small></button>`).join('')}</section>`;
  }).join('') || '<p class="muted">没有匹配的文件或函数。</p>';
  $('files').querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => select(el.dataset.id)));
}
function renderDetails() {
  const node = nodeById(selected);
  if (!node) return;
  const outgoing = map.edges.filter(e => e.source === selected && e.kind === (node.kind === 'module' ? 'import' : 'call'));
  const incoming = map.edges.filter(e => e.target === selected && e.kind === (node.kind === 'module' ? 'import' : 'call'));
  const unresolved = map.unresolved.filter(e => e.owner === selected);
  const linkList = (edges, incoming) => [...new Set(edges.map(e => incoming ? e.source : e.target))].map(id => `<button class="relation" data-id="${esc(id)}">${esc(nodeById(id)?.name)} <span>↗</span></button>`).join('');
  $('details').innerHTML = `<span class="type-label">${node.kind === 'function' ? (node.async ? 'ASYNC FUNCTION' : 'FUNCTION') : 'MODULE'}</span><h2>${esc(node.name)}</h2><button id="source" class="source-link">${esc(rel(node.file))}:${node.line} ↗</button><p class="summary">${esc(node.summary)}</p>
  ${node.parameters?.length ? `<h3>输入参数</h3><div class="parameters">${node.parameters.map(p => `<code>${esc(p)}</code>`).join('')}</div>` : ''}
  <div class="counts"><div><strong>${new Set(incoming.map(e=>e.source)).size}</strong><span>${node.kind === 'module' ? '被依赖' : '调用来源'}</span></div><div><strong>${new Set(outgoing.map(e=>e.target)).size}</strong><span>${node.kind === 'module' ? '依赖模块' : '调用目标'}</span></div><div><strong>${unresolved.length}</strong><span>未解析项</span></div></div>
  ${incoming.length ? `<h3>${node.kind === 'module' ? '谁依赖它' : '谁调用它'}</h3>${linkList(incoming,true)}` : ''}
  ${outgoing.length ? `<h3>${node.kind === 'module' ? '它依赖谁' : '它调用谁'}</h3>${linkList(outgoing,false)}` : ''}
  ${node.kind === 'module' ? `<h3>模块内的函数</h3>${map.nodes.filter(n=>n.kind==='function' && n.file===node.file).map(n=>`<button class="relation" data-id="${esc(n.id)}">${esc(n.name)}<span>L${n.line}</span></button>`).join('') || '<p class="muted">此文件没有带实现体的函数。</p>'}` : ''}
  ${node.steps?.length ? `<h3>按源码结构阅读 <small>${node.steps.length} 步</small></h3><p class="muted hint">缩进表示嵌套；分支并非依次执行。点击步骤定位。</p><ol class="steps">${node.steps.map((step,i)=>`<li class="depth-${Math.min(step.depth,3)}"><button data-step="${i}"><span class="step-meta"><span>${esc(step.kind)}</span><small>L${step.line}</small></span><code>${esc(step.text)}</code></button></li>`).join('')}</ol>${node.stepsTruncated ? '<p class="muted">仅显示前 80 步，请结合源码阅读。</p>' : ''}` : ''}
  ${unresolved.length ? `<details><summary>外部 / 未解析关系（${unresolved.length}）</summary><p class="muted hint">可能是外部库、动态调用、缺少类型信息，或扫描范围外的源码；不会据此推断调用边。</p>${unresolved.slice(0,50).map(u=>`<button class="unresolved" data-line="${u.line}"><code>${esc(u.label)}</code><small>L${u.line}</small></button>`).join('')}${unresolved.length>50?'<p>其余项省略</p>':''}</details>` : ''}
  <p class="inspector-note">结构摘要由规则生成。当前未接入 AI，不推断业务意图，也不修改源码。</p>`;
  $('source').onclick = () => navigate(node.id,node.line);
  $('details').querySelectorAll('[data-id]').forEach(el => el.onclick = () => select(el.dataset.id));
  $('details').querySelectorAll('[data-step]').forEach(el => el.onclick = () => navigate(node.id,node.steps[Number(el.dataset.step)].line));
  $('details').querySelectorAll('[data-line]').forEach(el => el.onclick = () => navigate(node.id,Number(el.dataset.line)));
}
const svgEl = (tag,attrs={}) => { const el = document.createElementNS('http://www.w3.org/2000/svg',tag); for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,String(v)); return el; };
const view = () => $('graph').setAttribute('viewBox',`${box.x} ${box.y} ${box.w} ${box.h}`);
function renderGraph() {
  const svg = $('graph'); svg.replaceChildren();
  let node = nodeById(selected);
  let center = selected;
  if (mode === 'modules' && node?.kind === 'function') center = map.nodes.find(n=>n.kind==='module' && n.file===node.file)?.id;
  if (mode === 'calls' && node?.kind === 'module') center = map.nodes.find(n=>n.kind==='function' && n.file===node.file)?.id ?? selected;
  const kind = mode === 'modules' ? 'import' : 'call';
  let edges = map.edges.filter(e=>e.kind===kind);
  let ids;
  if (focused || mode === 'calls') {
    edges = edges.filter(e=>e.source===center || e.target===center);
    ids = new Set([center,...edges.flatMap(e=>[e.source,e.target])]);
  } else ids = new Set(map.nodes.filter(n=>n.kind==='module').map(n=>n.id));
  let nodes = map.nodes.filter(n=>ids.has(n.id));
  const clipped = nodes.length > 80;
  if (clipped) nodes = [...nodes.filter(n=>n.id===center),...nodes.filter(n=>n.id!==center)].slice(0,80);
  ids = new Set(nodes.map(n=>n.id)); edges = edges.filter(e=>ids.has(e.source) && ids.has(e.target));
  const unique = [...new Map(edges.map(e=>[`${e.source}\u0000${e.target}`,e])).values()];
  $('modules').classList.toggle('active',mode==='modules'); $('calls').classList.toggle('active',mode==='calls');
  $('scope').textContent = mode==='calls' ? '函数视图：一跳关系' : focused ? '显示全部模块' : '只看相邻关系';
  $('scope').disabled = mode==='calls';
  $('graph-kicker').textContent = mode==='modules' ? 'MODULE DEPENDENCIES' : 'FUNCTION NEIGHBORHOOD';
  $('graph-title').textContent = mode==='modules' ? '模块如何连接' : nodeById(center)?.name ?? '函数关系';
  $('graph-description').textContent = mode==='modules' ? '顺着箭头，找到当前模块依赖的下一站。' : '只展开当前函数的直接关系；点击相邻节点继续探索。';
  $('graph-count').textContent = `${nodes.length} 节点 · ${unique.length} 条关系${clipped?' · 已截取前 80 个节点':''}`;
  $('empty').textContent = !nodes.length ? '未找到源码文件。请打开包含 TypeScript / JavaScript 的目录。' : '';
  const defs = svgEl('defs'); const marker = svgEl('marker',{id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'}); marker.append(svgEl('path',{d:'M 0 0 L 10 5 L 0 10 z',class:'arrow'})); defs.append(marker); svg.append(defs);
  const graph = new dagre.graphlib.Graph().setGraph({rankdir:'LR',ranksep:95,nodesep:30,marginx:50,marginy:50}).setDefaultEdgeLabel(()=>({}));
  nodes.forEach(n=>graph.setNode(n.id,{width:240,height:76})); unique.forEach(e=>graph.setEdge(e.source,e.target)); dagre.layout(graph);
  unique.forEach(edge=>{
    const points = graph.edge(edge.source,edge.target).points;
    const el = svgEl('path',{d:points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' '),class:`edge ${edge.source===center || edge.target===center?'related':''}`,'marker-end':'url(#arrow)'});
    const title = svgEl('title'); title.textContent = `${edge.label} · L${edge.line}`; el.append(title); svg.append(el);
  });
  nodes.forEach(n=>{
    const p = graph.node(n.id); const group = svgEl('g',{transform:`translate(${p.x-120} ${p.y-38})`,class:`node ${n.id===center?'current':''}`,tabindex:0,role:'button','aria-label':n.name});
    group.append(svgEl('rect',{width:240,height:76,rx:9}));
    const label = svgEl('text',{x:17,y:29,class:'node-label'}); label.textContent = n.name.length>28 ? '…'+n.name.slice(-27) : n.name;
    const sub = svgEl('text',{x:17,y:52,class:'node-subtitle'}); sub.textContent = n.kind==='module' ? `${map.nodes.filter(f=>f.kind==='function' && f.file===n.file).length} 个函数 · 模块` : `${rel(n.file).split('/').pop()}:${n.line}`;
    const title = svgEl('title'); title.textContent = `${n.name}\n${rel(n.file)}:${n.line}`;
    group.append(label,sub,title); group.onclick=()=>select(n.id); group.ondblclick=()=>navigate(n.id,n.line);
    group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault(); select(n.id);}}; svg.append(group);
  });
  const width = graph.graph().width || 600, height = graph.graph().height || 400;
  const rect = $('graph-wrap').getBoundingClientRect();
  const ratio = Math.max(0.5,rect.width/Math.max(1,rect.height));
  const w = Math.max(width,height*ratio), h = w/ratio;
  box = {x:(width-w)/2,y:(height-h)/2,w,h}; initialBox={...box}; view();
}
function render() { if(!map)return; renderList(); renderGraph(); renderDetails(); }
function zoom(factor) { const w=box.w*factor,h=box.h*factor; if(w<150||w>60000)return; box={x:box.x+(box.w-w)/2,y:box.y+(box.h-h)/2,w,h}; view(); }
$('refresh').onclick=()=>vscode.postMessage({type:'refresh'});
$('search').oninput=()=>map&&renderList();
$('modules').onclick=()=>{mode='modules';render();}; $('calls').onclick=()=>{mode='calls';render();};
$('scope').onclick=()=>{focused=!focused;renderGraph();};
$('zoom-in').onclick=()=>zoom(.8); $('zoom-out').onclick=()=>zoom(1.25); $('fit').onclick=()=>{box={...initialBox};view();};
$('graph').addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.12:.89);},{passive:false});
let drag;
$('graph').onpointerdown=e=>{if(e.target.closest('.node'))return;drag={x:e.clientX,y:e.clientY,box:{...box}};$('graph').setPointerCapture(e.pointerId);};
$('graph').onpointermove=e=>{if(!drag)return;const rect=$('graph').getBoundingClientRect();box={...box,x:drag.box.x-(e.clientX-drag.x)*drag.box.w/rect.width,y:drag.box.y-(e.clientY-drag.y)*drag.box.h/rect.height};view();};
$('graph').onpointerup=$('graph').onpointercancel=()=>{drag=undefined;};
window.addEventListener('message',event=>{
  const message=event.data;
  if(message.type==='busy'){busy=true;$('status').textContent='正在分析源码…';$('refresh').disabled=true;}
  if(message.type==='map'){
    const previous=nodeById(selected); map=message.map;
    selected=nodeById(selected)?.id ?? map.nodes.find(n=>n.name===previous?.name && n.file===previous?.file)?.id ?? map.nodes[0]?.id;
    busy=false;$('refresh').disabled=false;$('status').textContent='已更新 · 本地分析';
    $('notice').textContent=map.warnings.join(' ');$('notice').classList.toggle('visible',!!map.warnings.length);render();
  }
  if(message.type==='selection' && message.id && message.id!==selected)select(message.id,true);
  if(message.type==='error'){busy=false;$('refresh').disabled=false;$('status').textContent='分析失败';$('notice').textContent=message.message;$('notice').classList.add('visible');}
});
vscode.postMessage({type:'ready'});
