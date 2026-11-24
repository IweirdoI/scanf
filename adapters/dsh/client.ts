import { ProjectEntry } from "./entry";
import {
  createElement as h,
  useState,
  useEffect,
  useRef,
  type ComponentType,
} from "react";

const id = "dsh-scanf-reader";
interface SidebarService {
  dock: (paneId: string) => unknown;
  float: (
    tabId: string,
    rect: { x: number; y: number; width: number; height: number },
  ) => unknown;
  openResource: (
    address: string,
    options?: { params?: { line: number }; preferNewPane?: boolean },
  ) => unknown;
}
export interface SidebarContext {
  connection: {
    rpc: {
      call(
        channel: string,
        endpoint: string,
        payload: unknown,
      ): Promise<{
        ok: boolean;
        value?: { url: string };
        error?: { message: string };
      }>;
    };
  };
  effect: (install: () => unknown, label?: string) => unknown;
  sidebarRight: SidebarService;
  sidebarRightTabs: {
    register: (definition: Record<string, unknown>) => unknown;
  };
  slots: {
    inject: (seat: string, register: () => unknown) => unknown;
    register: (
      seat: { name: string; key: string },
      component: ComponentType<any>,
    ) => unknown;
  };
}
export const inject = [
  "sidebarRightTabs",
  "sidebarRight",
  "slots",
  "connection",
];
export function localReaderUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !/^\d+$/.test(url.port) ||
    url.pathname !== "/" ||
    !/^#[a-f0-9]{48}$/.test(url.hash) ||
    url.username ||
    url.password ||
    url.search
  )
    throw new Error("后台返回的阅读连接无效，请重试。");
  return url.href;
}
export function sourceAddress(file: string, sessionId?: string): string {
  const normalized = file.replace(/\\/g, "/");
  if (
    !/^(?:[A-Za-z]:\/|\/)/.test(normalized) ||
    normalized.split("/").some((p) => p === ".." || p === ".") ||
    normalized.includes("\0")
  )
    throw new Error("源码路径无效。");
  // rc.5's built-in preview accepts sessionFileAddress(sessionId, path),
  // including absolute paths. The workspace backend still enforces access.
  return (
    (sessionId
      ? `dsh-resource://file/session/${encodeURIComponent(sessionId)}/`
      : "dsh-resource://file/absolute/") +
    (sessionId ? normalized : normalized.replace(/^\//, ""))
      .split("/")
      .map((p) => encodeURIComponent(p).replace(/%3A/gi, ":"))
      .join("/")
  );
}
interface BodyProps {
  sessionId: string;
  useTabInfo: () => { tab: { id: string }; panel: { id: string } };
  sidebar: SidebarService;
  connect: (sessionId: string, root?: string) => Promise<string>;
}
function ReaderBody({ useTabInfo, sidebar, sessionId, connect }: BodyProps) {
  const { tab, panel } = useTabInfo();
  const [retry, setRetry] = useState(0),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const savedRoot = () => {
    try {
      return localStorage.getItem(`scanf-project:${sessionId}`) || "";
    } catch {
      return "";
    }
  };
  const [selection, setSelection] = useState({ sessionId, path: savedRoot() });
  const projectRoot =
    selection.sessionId === sessionId ? selection.path : savedRoot();
  const [choosing, setChoosing] = useState(false),
    [draft, setDraft] = useState(projectRoot);
  useEffect(() => {
    let cancelled = false;
    setUrl("");
    setError("");
    if (!sessionId) {
      setError("请先选择一个项目会话，再打开代码阅读。");
      return;
    }
    connect(sessionId, projectRoot || undefined)
      .then((address) => {
        if (!cancelled) setUrl(localReaderUrl(address));
      })
      .catch((error) => {
        if (!cancelled) setError(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, connect, retry, projectRoot]);
  const iframe = useRef<HTMLIFrameElement>(null);
  const nativeOpened = useRef(false);
  const ready = () =>
    iframe.current?.contentWindow?.postMessage(
      { type: "scanf:host", capabilities: ["expand", "compact", "navigate"] },
      new URL(url).origin,
    );
  useEffect(() => {
    if (!url) return;
    const origin = new URL(url).origin;
    const listener = async (event: MessageEvent) => {
      if (
        event.source !== iframe.current?.contentWindow ||
        event.origin !== origin ||
        event.data?.type !== "scanf:request"
      )
        return;
      const data = event.data;
      try {
        if (data.action === "expand") {
          const width = Math.max(320, Math.min(1240, window.innerWidth - 32)),
            height = Math.max(260, Math.min(880, window.innerHeight - 48));
          sidebar.float(tab.id, {
            x: Math.max(16, (window.innerWidth - width) / 2),
            y: 24,
            width,
            height,
          });
        } else if (data.action === "compact") {
          sidebar.dock(panel.id);
        } else if (data.action === "navigate") {
          if (
            typeof data.file !== "string" ||
            !Number.isInteger(data.line) ||
            data.line < 1
          )
            throw new Error("无效源码位置。");
          if (!sessionId)
            throw new Error("当前宿主没有提供会话身份，无法在原生编辑器打开。");
          await sidebar.openResource(sourceAddress(data.file, sessionId), {
            params: { line: data.line },
            preferNewPane: !nativeOpened.current,
          });
          nativeOpened.current = true;
        } else throw new Error("未知宿主请求。");
        iframe.current?.contentWindow?.postMessage(
          {
            type: "scanf:response",
            requestId: data.requestId,
            result: { ok: true },
          },
          origin,
        );
      } catch (error) {
        iframe.current?.contentWindow?.postMessage(
          {
            type: "scanf:response",
            requestId: data.requestId,
            error: String(error),
          },
          origin,
        );
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [url, tab.id, panel.id, sidebar, sessionId]);
  if (choosing)
    return h(ProjectEntry, {
      value: draft,
      onChange: setDraft,
      onCancel: () => setChoosing(false),
      onSubmit: () => {
        const path = draft.trim();
        try {
          path
            ? localStorage.setItem(`scanf-project:${sessionId}`, path)
            : localStorage.removeItem(`scanf-project:${sessionId}`);
        } catch {}
        setSelection({ sessionId, path });
        setChoosing(false);
        setRetry((n) => n + 1);
      },
    });
  const chooseButton = h(
    "button",
    {
      onClick: () => {
        setDraft(projectRoot);
        setChoosing(true);
      },
      style: {
        font: "inherit",
        fontSize: 10,
        color: "inherit",
        border: 0,
        background: "transparent",
        padding: "4px 10px",
        cursor: "pointer",
        flexShrink: 0,
      },
      title: projectRoot || "跟随当前会话项目",
    },
    "切换项目",
  );
  if (url)
    return h(
      "div",
      {
        style: {
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 10,
            paddingLeft: 10,
            borderBottom: "1px solid #80808022",
          },
        },
        h(
          "span",
          { style: { opacity: 0.55 } },
          projectRoot
            ? projectRoot.replace(/\\/g, "/").split("/").pop()
            : "当前会话项目",
        ),
        chooseButton,
      ),
      h("iframe", {
        ref: iframe,
        onLoad: ready,
        src: url,
        title: "Scanf 项目代码阅读",
        referrerPolicy: "no-referrer",
        sandbox: "allow-scripts allow-same-origin",
        style: { border: 0, width: "100%", flex: 1, minHeight: 0 },
      }),
    );
  return h(
    "div",
    {
      style: {
        padding: 24,
        fontFamily: "inherit",
        color: "inherit",
        fontSize: 12,
      },
      role: "status",
    },
    h("p", null, error || "正在打开当前项目代码…"),
    error ? chooseButton : null,
    error
      ? h(
          "button",
          {
            onClick: () => setRetry((n) => n + 1),
            style: { padding: "6px 14px", borderRadius: 6, cursor: "pointer" },
          },
          "重试",
        )
      : null,
  );
}
export function apply(ctx: SidebarContext) {
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id,
        kind: "scanf-reader",
        title: () => "Scanf 代码阅读",
        guide: [
          {
            id: "scanf-reader-open",
            order: 40,
            title: () => "Scanf 代码阅读",
            description: () => "树、完整源码与参数对照阅读",
          },
        ],
        keepMounted: true,
      }),
    "Scanf reading tab",
  );
  const connect = async (sessionId: string, root?: string) => {
    const result = await ctx.connection.rpc.call("/api", "scanf/connect", {
      sessionId,
      ...(root ? { root } : {}),
    });
    if (!result.ok || !result.value?.url)
      throw new Error(result.error?.message || "无法打开当前项目，请重试。");
    return result.value.url;
  };
  const Body = (props: Omit<BodyProps, "sidebar" | "connect">) =>
    h(ReaderBody, { ...props, sidebar: ctx.sidebarRight, connect });
  ctx.effect(
    () =>
      ctx.slots.inject("sidebar.right.pane.tab", () =>
        ctx.slots.register({ name: "sidebar.right.pane.tab", key: id }, Body),
      ),
    "Scanf reading body",
  );
}
