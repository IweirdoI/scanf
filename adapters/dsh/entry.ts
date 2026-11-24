import { createElement as h, useEffect, useRef, useState } from "react";
import { FolderOpen, ArrowRight, X, SquareCode, ShieldCheck } from "lucide";

function glyph(node: typeof FolderOpen, size = 16) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.7,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
    },
    ...node.map(([tag, attrs]) => h(tag, attrs)),
  );
}

const styles = `
.scanf-entry{--se-bg:#f8f9fc;--se-card:#fff;--se-fg:#303442;--se-muted:#7b8293;--se-line:#e6e8ef;--se-accent:#6853cf;--se-active:#eeebfc;--se-hover:#eceef4;box-sizing:border-box;height:100%;min-height:0;overflow:auto;background:var(--se-bg);color:var(--se-fg);font:13px/1.7 "Segoe UI","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;}
.scanf-entry[data-tone=dark]{--se-bg:#161920;--se-card:#1e222b;--se-fg:#dce0e9;--se-muted:#8e97aa;--se-line:#2a2f3b;--se-accent:#aa9bff;--se-active:#302a49;--se-hover:#232833;color-scheme:dark;}
.scanf-entry *{box-sizing:border-box;}
.scanf-entry svg{flex-shrink:0;}
.scanf-entry button,.scanf-entry input{font:inherit;color:inherit;box-shadow:none;}
.scanf-entry button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid transparent;cursor:pointer;border-radius:7px;background:transparent;transition:background .12s,border-color .12s;}
.scanf-entry button:focus-visible,.scanf-entry input:focus-visible{outline:2px solid var(--se-accent);outline-offset:2px;}
.scanf-entry .se-header{height:54px;display:flex;align-items:center;gap:8px;padding:0 18px;border-bottom:1px solid var(--se-line);background:var(--se-card);}
.scanf-entry .se-logo{height:27px;width:27px;display:grid;place-items:center;border:1px solid var(--se-line);border-radius:7px;background:var(--se-active);color:var(--se-accent);}
.scanf-entry .se-brand{font-size:14px;font-weight:650;letter-spacing:-.4px;}
.scanf-entry .se-caption{font-size:10px;color:var(--se-muted);margin-left:5px;}
.scanf-entry .se-close{margin-left:auto;padding:6px;color:var(--se-muted);width:28px;height:28px;}
.scanf-entry .se-close:hover,.scanf-entry .se-secondary:hover{background:var(--se-hover);}
.scanf-entry .se-content{width:100%;max-width:440px;margin:0 auto;padding:clamp(24px,7vh,62px) 24px 24px;}
.scanf-entry .se-kicker{display:flex;align-items:center;gap:7px;font-size:10px;color:var(--se-muted);margin-bottom:24px;}
.scanf-entry .se-kicker span:last-child{color:var(--se-accent);}
.scanf-entry .se-hero-icon{display:grid;place-items:center;width:44px;height:44px;color:var(--se-accent);background:var(--se-active);border:1px solid var(--se-line);border-radius:12px;margin-bottom:17px;}
.scanf-entry h2{margin:0 0 8px;font-size:20px;line-height:1.5;letter-spacing:-.5px;font-weight:600;color:var(--se-fg);}
.scanf-entry .se-description{margin:0 0 27px;font-size:12px;line-height:1.9;color:var(--se-muted);}
.scanf-entry form{margin:0;}
.scanf-entry label{display:block;font-size:11px;font-weight:600;margin-bottom:8px;color:var(--se-fg);}
.scanf-entry .se-field{display:flex;align-items:center;gap:9px;padding:0 12px;border:1px solid var(--se-line);border-radius:8px;background:var(--se-card);color:var(--se-muted);min-height:42px;transition:border-color .12s,box-shadow .12s;}
.scanf-entry .se-field:focus-within{border-color:var(--se-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--se-accent) 10%,transparent);}
.scanf-entry .se-field input{display:block;min-width:0;width:100%;padding:10px 0;border:0!important;border-radius:0;background:transparent!important;color:var(--se-fg);font:12px/1.7 ui-monospace,Consolas,monospace;outline:none!important;}
.scanf-entry input::placeholder{color:var(--se-muted);font-size:11px;}
.scanf-entry .se-hint{font-size:10px;line-height:1.8;color:var(--se-muted);margin:9px 0 23px;}
.scanf-entry .se-actions{display:flex;gap:9px;align-items:center;}
.scanf-entry .se-primary{flex:1;min-height:37px;padding:8px 14px;background:var(--se-active);border-color:color-mix(in srgb,var(--se-accent) 24%,transparent);color:var(--se-accent);font-size:12px;font-weight:600;}
.scanf-entry .se-primary:hover{background:color-mix(in srgb,var(--se-accent) 21%,var(--se-card));border-color:var(--se-accent);}
.scanf-entry .se-secondary{padding:8px 15px;min-height:37px;font-size:12px;border-color:var(--se-line);background:var(--se-card);color:var(--se-muted);}
.scanf-entry .se-footnote{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:25px;padding-top:18px;border-top:1px solid var(--se-line);color:var(--se-muted);font-size:10px;}
@media(max-width:340px){.scanf-entry .se-content{padding-left:18px;padding-right:18px}.scanf-entry .se-caption{display:none}}
@media(prefers-reduced-motion:reduce){.scanf-entry *{transition:none!important}}
`;

export function ProjectEntry({
  value,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: string;
  onChange(value: string): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    // Read the host's inherited text colour rather than the OS preference: DSH
    // can use a dark theme while Windows and the embedded reader are light.
    const sync = () => {
      const parent = wrapper.current?.parentElement;
      if (!parent) return;
      const rgb = getComputedStyle(parent)
        .color.match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
      if (rgb?.length === 3)
        setDark(rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 140);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class", "data-theme", "data-color-scheme"],
    });
    return () => observer.disconnect();
  }, []);
  return h(
    "div",
    {
      ref: wrapper,
      className: "scanf-entry",
      "data-tone": dark ? "dark" : "light",
    },
    h("style", null, styles),
    h(
      "div",
      { className: "se-header" },
      h("span", { className: "se-logo" }, glyph(SquareCode, 17)),
      h("span", { className: "se-brand" }, "Scanf"),
      h("span", { className: "se-caption" }, "代码阅读空间"),
      h(
        "button",
        {
          type: "button",
          className: "se-close",
          "aria-label": "关闭项目选择",
          onClick: onCancel,
        },
        glyph(X),
      ),
    ),
    h(
      "div",
      { className: "se-content" },
      h(
        "div",
        { className: "se-kicker" },
        "阅读空间",
        h("span", null, "/"),
        h("span", null, "选择项目"),
      ),
      h("span", { className: "se-hero-icon" }, glyph(FolderOpen, 23)),
      h("h2", null, "从一个项目开始"),
      h(
        "p",
        { className: "se-description" },
        "打开代码所在的文件夹，",
        h("br"),
        "沿着结构与调用逻辑，读懂每一段代码。",
      ),
      h(
        "form",
        {
          onSubmit: (event: { preventDefault(): void }) => {
            event.preventDefault();
            onSubmit();
          },
        },
        h("label", { htmlFor: "scanf-project-path" }, "项目文件夹"),
        h(
          "div",
          { className: "se-field" },
          glyph(FolderOpen),
          h("input", {
            id: "scanf-project-path",
            value,
            "aria-label": "项目文件夹",
            placeholder: "例如 E:/code/my-project",
            spellCheck: false,
            autoComplete: "off",
            onChange: (event: { target: { value: string } }) =>
              onChange(event.target.value),
          }),
        ),
        h(
          "p",
          { className: "se-hint" },
          "留空即可跟随当前会话，项目选择会自动记住。",
        ),
        h(
          "div",
          { className: "se-actions" },
          h(
            "button",
            { type: "button", className: "se-secondary", onClick: onCancel },
            "取消",
          ),
          h(
            "button",
            { type: "submit", className: "se-primary" },
            "开始阅读",
            glyph(ArrowRight, 15),
          ),
        ),
      ),
      h(
        "div",
        { className: "se-footnote" },
        glyph(ShieldCheck, 12),
        "仅在本机读取 · 不修改源码",
      ),
    ),
  );
}
