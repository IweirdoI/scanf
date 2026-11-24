/** Workspace navigation stays independent of the Agent / editor transport. */
export function installNavigation({
  root,
  getView,
  inspect,
  goLine,
  icon,
  esc,
}) {
  const $ = (id) => document.getElementById(id);
  const dialog = $("command-dialog"),
    input = $("command-input");
  let candidates = [],
    active = 0,
    returnFocus;
  function collect() {
    const view = getView(),
      found = new Map();
    const walk = (node, path = "") => {
      const fullPath = [path, node.label].filter(Boolean).join("/");
      if (node.symbolId && !found.has(node.symbolId))
        found.set(node.symbolId, {
          id: node.symbolId,
          name: node.label,
          detail: path,
          kind: node.kind,
        });
      node.children.forEach((child) =>
        walk(
          child,
          ["module", "directory"].includes(node.kind) && node.id !== "project"
            ? fullPath
            : path,
        ),
      );
    };
    if (view) walk(view.project);
    return [...found.values()];
  }
  function render() {
    const query = input.value.trim().toLowerCase();
    if (query.startsWith(":")) {
      const line = Number(query.slice(1));
      const valid =
        /^:\d+$/.test(query) &&
        Number.isSafeInteger(line) &&
        line >= 1 &&
        line <= (getView()?.file?.lineCount ?? 0);
      candidates = valid
        ? [
            {
              line,
              name: `跳到第 ${line} 行`,
              detail: getView().file.path.split("/").pop(),
            },
          ]
        : [];
      $("command-label").textContent =
        `行号 · 当前文件共 ${getView()?.file?.lineCount ?? 0} 行`;
    } else {
      const tokens = query.split(/\s+/).filter(Boolean);
      candidates = collect()
        .filter((item) =>
          tokens.every((q) =>
            `${item.name} ${item.detail}`.toLowerCase().includes(q),
          ),
        )
        .sort(
          (a, b) =>
            Number(b.name.toLowerCase().startsWith(query)) -
            Number(a.name.toLowerCase().startsWith(query)),
        )
        .slice(0, 40);
      $("command-label").textContent = query
        ? `匹配结果 · ${candidates.length}${candidates.length === 40 ? "+" : ""}`
        : "项目文件与符号";
    }
    active = Math.min(active, Math.max(0, candidates.length - 1));
    $("command-results").innerHTML =
      candidates
        .map(
          (item, index) =>
            `<button type="button" role="option" id="quick-result-${index}" aria-selected="${index === active}" data-index="${index}">${icon(item.line ? "MapPin" : item.kind === "module" ? "FileCode" : "Braces")}<span><strong>${esc(item.name)}</strong><small>${esc(item.detail || (item.kind === "module" ? "源码文件" : "项目符号"))}</small></span>${index === active ? icon("CornerDownLeft") : ""}</button>`,
        )
        .join("") ||
      `<div class="command-empty">${query.startsWith(":") ? "输入当前文件范围内的行号，例如 :12" : "没有匹配的文件或符号，试试更短的关键词。"}</div>`;
    $("command-results")
      .querySelectorAll("[data-index]")
      .forEach((el) => (el.onclick = () => choose(Number(el.dataset.index))));
    input.setAttribute("aria-expanded", String(dialog.open));
    if (candidates.length)
      input.setAttribute("aria-activedescendant", `quick-result-${active}`);
    else input.removeAttribute("aria-activedescendant");
    $("command-results")
      .querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }
  function close() {
    dialog.close();
    input.setAttribute("aria-expanded", "false");
    returnFocus?.focus();
  }
  function choose(index = active) {
    const item = candidates[index];
    if (!item) return;
    close();
    if (item.line) goLine(item.line);
    else inspect(item.id);
  }
  function open(value = "") {
    returnFocus = document.activeElement;
    input.value = value;
    active = 0;
    dialog.showModal();
    render();
    input.focus();
  }
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", "command-results");
  input.setAttribute("aria-autocomplete", "list");
  input.oninput = () => {
    active = 0;
    render();
  };
  input.onkeydown = (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      choose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      active =
        (active + (event.key === "ArrowDown" ? 1 : -1) + candidates.length) %
        (candidates.length || 1);
      render();
    }
  };
  $("line-form").onsubmit = (event) => {
    event.preventDefault();
    choose();
  };
  $("close-command").onclick = close;
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.onclick = (event) => {
    if (event.target === dialog) close();
  };
  $("quick-open").onclick = $("footer-search").onclick = () => open();
  $("goto").onclick = () => open(":");
  document.addEventListener("keydown", (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      ["k", "p", "g"].includes(event.key.toLowerCase())
    ) {
      event.preventDefault();
      if (!dialog.open) open(event.key.toLowerCase() === "g" ? ":" : "");
    }
  });

  const resize = $("sidebar-resize");
  const setWidth = (width) => {
    width = Math.max(180, Math.min(420, Math.round(width)));
    root.style.setProperty("--sidebar-width", `${width}px`);
    resize.setAttribute("aria-valuenow", String(width));
  };
  resize.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resize.setPointerCapture(event.pointerId);
    root.classList.add("resizing");
    const move = (e) => setWidth(e.clientX - root.getBoundingClientRect().left);
    const stop = () => {
      root.classList.remove("resizing");
      resize.removeEventListener("pointermove", move);
      resize.removeEventListener("pointerup", stop);
      resize.removeEventListener("pointercancel", stop);
      resize.removeEventListener("lostpointercapture", stop);
    };
    resize.addEventListener("pointermove", move);
    resize.addEventListener("pointerup", stop);
    resize.addEventListener("pointercancel", stop);
    resize.addEventListener("lostpointercapture", stop);
  };
  resize.onkeydown = (event) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const current = Number(resize.getAttribute("aria-valuenow"));
      setWidth(
        event.key === "Home"
          ? 180
          : event.key === "End"
            ? 420
            : current + (event.key === "ArrowRight" ? 16 : -16),
      );
    }
  };
  resize.ondblclick = () => setWidth(250);
}
