import { basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  Decoration,
  hoverTooltip,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { openSearchPanel } from "@codemirror/search";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const readableSyntax = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syntax-keyword)" },
  { tag: [tags.variableName, tags.propertyName], color: "var(--fg)" },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--syntax-function)",
  },
  { tag: [tags.typeName, tags.className], color: "var(--syntax-type)" },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--syntax-number)" },
  { tag: tags.comment, color: "var(--syntax-comment)" },
  { tag: [tags.operator, tags.punctuation], color: "var(--fg)" },
]);

/** A real read-only editor. All navigation targets come from the analyzed snapshot. */
export function createReaderEditor(
  parent,
  { onInspect, onCursor, onStatus, getModelConfig, onExplain, onModelSettings },
) {
  let data,
    selected,
    first = 1,
    last = 1,
    base = 0,
    refs = [],
    params = [],
    notes = [],
    suppress = false,
    focusedParameter;
  const decorations = new Compartment(),
    language = new Compartment(),
    numbers = new Compartment();
  const theme = EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "14px",
      backgroundColor: "var(--editor-bg)",
      color: "var(--fg)",
    },
    ".cm-scroller": {
      fontFamily: "ui-monospace,Consolas,monospace",
      lineHeight: "1.7",
      overflow: "auto",
    },
    ".cm-content": { padding: "12px 0" },
    ".cm-gutters": {
      backgroundColor: "var(--editor-bg)",
      color: "var(--muted)",
      borderRight: "1px solid var(--line)",
    },
    ".cm-reading-line": { backgroundColor: "var(--code-selection)" },
    ".cm-symbol-link": {
      cursor: "pointer",
      textDecoration: "underline",
      textDecorationColor: "var(--line)",
      textUnderlineOffset: "3px",
    },
    ".cm-parameter-focus": {
      backgroundColor: "var(--active)",
      outline: "1px solid var(--accent)",
      borderRadius: "2px",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--panel)",
      color: "var(--fg)",
      border: "1px solid var(--line)",
      borderRadius: "7px",
      padding: "10px",
      maxWidth: "400px",
    },
    ".cm-tooltip p": { margin: "4px 0", whiteSpace: "pre-wrap" },
    ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--fg)" },
    ".cm-activeLine": { backgroundColor: "var(--code-selection)" },
    ".cm-searchMatch": { backgroundColor: "#d6ad4e55" },
  });
  const refAt = (position) =>
    refs.find((r) => r.from <= position && r.to >= position);
  const follow = (position) => {
    const ref = refAt(position);
    if (ref) {
      onInspect(ref.targetId, { line: ref.line });
      return true;
    }
    onStatus("当前位置没有已解析的定义。可在右侧查看未解析关系。");
    return false;
  };
  const editor = new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        syntaxHighlighting(readableSyntax),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.contentAttributes.of({
          tabindex: "0",
          "aria-readonly": "true",
        }),
        theme,
        EditorState.phrases.of({
          Find: "查找",
          next: "下一个",
          previous: "上一个",
          all: "全部",
          "match case": "区分大小写",
          regexp: "正则",
          "by word": "整词",
          close: "关闭",
          "No matches": "没有匹配",
        }),
        EditorView.cspNonce.of(
          document.querySelector('meta[name="scanf-nonce"]')?.content ?? "",
        ),
        language.of(javascript({ typescript: true, jsx: true })),
        numbers.of(lineNumbers()),
        decorations.of([]),
        keymap.of([
          { key: "F12", run: (view) => follow(view.state.selection.main.head) },
          {
            key: "Mod-Enter",
            run: (view) => follow(view.state.selection.main.head),
          },
        ]),
        EditorView.domEventHandlers({
          mousedown: (event, view) => {
            if (!event.ctrlKey && !event.metaKey) return false;
            const position = view.posAtCoords({
              x: event.clientX,
              y: event.clientY,
            });
            if (position === null) return false;
            event.preventDefault();
            return follow(position);
          },
        }),
        hoverTooltip(
          (_view, position) => {
            const parameter = params.find((p) =>
              [p, ...p.uses].some(
                (r) => r.from <= position && r.to >= position,
              ),
            );
            const ref = refAt(position);
            const word = _view.state.wordAt(position);
            if (!parameter && !ref && !word) return null;
            if (!data) return null;
            const line = _view.state.doc.lineAt(position).number + first - 1;
            const range = parameter
              ? [parameter, ...parameter.uses].find(
                  (r) => r.from <= position && r.to >= position,
                )
              : (ref ?? word);
            return {
              pos: range.from,
              end: range.to,
              above: true,
              create: () => {
                const dom = document.createElement("div");
                dom.className = "source-tooltip";
                const title = document.createElement("strong");
                title.textContent = parameter
                  ? `${parameter.name}: ${parameter.type}`
                  : (ref?.name ?? _view.state.sliceDoc(word.from, word.to));
                dom.append(title);
                const description = document.createElement("p");
                const note = notes.find((n) => n.name === parameter?.name);
                description.textContent = parameter
                  ? (note?.text ?? parameter.description)
                  : [
                      ref?.type,
                      ref?.documentation,
                      ref
                        ? `${ref.file}:${ref.line} · F12 / Ctrl+单击跳到定义`
                        : `源码 L${line} · 悬停解释`,
                    ]
                      .filter(Boolean)
                      .join("\n");
                dom.append(description);
                if (parameter) {
                  const source = document.createElement("small");
                  source.textContent = note
                    ? "Agent 解释 · 有源码引用"
                    : parameter.descriptionSource === "comment"
                      ? "来自源码注释"
                      : "根据实际用法整理；不推断业务含义";
                  dom.append(source);
                } else if (ref) {
                  const button = document.createElement("button");
                  button.textContent = "跳到定义";
                  button.onclick = () =>
                    onInspect(ref.targetId, { line: ref.line });
                  dom.append(button);
                }
                const ai = document.createElement("div");
                ai.className = "tooltip-ai";
                const result = document.createElement("p");
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = getModelConfig?.()?.configured
                  ? "AI 解释这一行"
                  : "配置模型以解释";
                ai.append(button, result);
                dom.append(ai);
                let cancelled = false,
                  started = false;
                const explain = async (manual = true) => {
                  if (!getModelConfig?.()?.configured) {
                    onModelSettings?.();
                    return;
                  }
                  if (started) return;
                  started = true;
                  button.disabled = true;
                  result.textContent = "正在生成悬停注释…";
                  try {
                    const text = await onExplain?.(line, manual);
                    if (!cancelled) {
                      result.textContent = text;
                      button.textContent = "AI 解读 · 请结合源码核对";
                    }
                  } catch (error) {
                    if (!cancelled) {
                      result.textContent = String(error);
                      started = false;
                      button.disabled = false;
                      button.textContent = "重试解释";
                    }
                  }
                };
                button.onclick = () => explain(true);
                return {
                  dom,
                  mount: () => {
                    if (
                      getModelConfig?.()?.configured &&
                      getModelConfig?.()?.hoverEnabled
                    )
                      void explain(false);
                  },
                  destroy: () => {
                    cancelled = true;
                  },
                };
              },
            };
          },
          { hoverTime: 220 },
        ),
        EditorView.updateListener.of((update) => {
          if (suppress || !data || !update.selectionSet) return;
          const line =
            update.state.doc.lineAt(update.state.selection.main.head).number +
            first -
            1;
          const node = data.symbols
            .filter((n) => n.line <= line && n.endLine >= line)
            .sort((a, b) => a.endLine - a.line - (b.endLine - b.line))[0];
          if (node && node.id !== selected?.id) onCursor(node.id);
        }),
      ],
    }),
  });
  function marks() {
    const marks = [];
    for (const ref of refs)
      if (
        ref.from >= 0 &&
        ref.to <= editor.state.doc.length &&
        ref.to > ref.from
      )
        marks.push(
          Decoration.mark({ class: "cm-symbol-link" }).range(ref.from, ref.to),
        );
    if (selected) {
      const start = Math.max(first, selected.line),
        end = Math.min(last, selected.endLine);
      for (let line = start; line <= end && line < start + 2000; line++)
        marks.push(
          Decoration.line({ class: "cm-reading-line" }).range(
            editor.state.doc.line(line - first + 1).from,
          ),
        );
    }
    if (focusedParameter)
      for (const parameter of params.filter((p) => p.name === focusedParameter))
        for (const range of [parameter, ...parameter.uses])
          if (
            range.from >= 0 &&
            range.to <= editor.state.doc.length &&
            range.to > range.from
          )
            marks.push(
              Decoration.mark({ class: "cm-parameter-focus" }).range(
                range.from,
                range.to,
              ),
            );
    return EditorView.decorations.of(Decoration.set(marks, true));
  }
  function setData(file, node, range, explanation, { reveal = true } = {}) {
    if (!file) return;
    data = file;
    selected = node;
    first = range?.start ?? 1;
    last = Math.min(file.lineCount, range?.end ?? file.lineCount);
    notes = explanation?.parameters ?? [];
    const normalized = file.text.replace(/\r\n?/g, "\n"),
      lines = normalized.split("\n");
    base = lines.slice(0, first - 1).reduce((n, s) => n + s.length + 1, 0);
    const removed = [...file.text.matchAll(/\r\n/g)].map((m) => m.index);
    const offset = (raw) => {
      let lo = 0,
        hi = removed.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (removed[mid] < raw) lo = mid + 1;
        else hi = mid;
      }
      return raw - lo - base;
    };
    refs = file.references.map((r) => ({
      ...r,
      from: offset(r.from),
      to: offset(r.to),
    }));
    params = (selected?.parameterDetails ?? []).map((p) => ({
      ...p,
      from: offset(p.from),
      to: offset(p.to),
      uses: p.uses.map((u) => ({
        ...u,
        from: offset(u.from),
        to: offset(u.to),
      })),
    }));
    const text = lines.slice(first - 1, last).join("\n");
    suppress = true;
    try {
      if (editor.state.doc.toString() !== text)
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: text },
          selection: { anchor: 0 },
        });
      editor.dispatch({
        effects: [
          language.reconfigure(
            javascript({
              typescript: /\.[cm]?tsx?$/.test(file.path),
              jsx: /\.[jt]sx$/.test(file.path),
            }),
          ),
          numbers.reconfigure(
            lineNumbers({ formatNumber: (n) => String(n + first - 1) }),
          ),
          decorations.reconfigure(marks()),
        ],
      });
      if (reveal && selected) goToLine(selected.line, false);
    } finally {
      suppress = false;
    }
  }
  function goToLine(line, focus = true) {
    if (!data) return;
    const bounded = Math.max(first, Math.min(last, line));
    const position = editor.state.doc.line(bounded - first + 1).from;
    suppress = true;
    try {
      editor.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, {
          y: "start",
          yMargin: 50,
        }),
      });
      if (focus) editor.focus();
    } finally {
      suppress = false;
    }
  }
  return {
    clear: () => {
      data = selected = undefined;
      refs = [];
      params = [];
      notes = [];
      focusedParameter = undefined;
      suppress = true;
      try {
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: "" },
          effects: decorations.reconfigure([]),
        });
      } finally {
        suppress = false;
      }
    },
    setData,
    goToLine,
    search: () => {
      openSearchPanel(editor);
      editor.focus();
    },
    definition: () => follow(editor.state.selection.main.head),
    focusParameter: (name) => {
      focusedParameter = name;
      editor.dispatch({ effects: decorations.reconfigure(marks()) });
      const p = params.find((p) => p.name === name);
      if (p) goToLine(p.uses[0]?.line ?? p.line);
    },
    getCursorLine: () =>
      editor.state.doc.lineAt(editor.state.selection.main.head).number +
      first -
      1,
  };
}
