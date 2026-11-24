import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { startLocalReader } from "../../src/local-reader";
import { ModelService } from "../../src/model-service";
export const inject = ["connection", "sessionPersistence", "credentials"];
interface HostContext {
  credentials: {
    resolve(ref: string): Promise<{ value: string } | undefined>;
    set(ref: string, value: string): Promise<void>;
    unset(ref: string): Promise<void>;
  };
  connection: {
    fetch: {
      register(route: {
        path: string;
        methods: string[];
        requestBody: string;
        fetch(request: Request): Promise<Response>;
      }): unknown;
    };
  };
  sessionPersistence: {
    stat(id: string): Promise<{ header: { cwd?: string } } | undefined>;
  };
  effect(install: () => unknown, label?: string): unknown;
}
export function apply(ctx: HostContext) {
  const model = new ModelService({
    read: async () => {
      const saved = await ctx.credentials.resolve("SCANF_READER_MODEL");
      return saved ? JSON.parse(saved.value) : undefined;
    },
    write: async (config) => {
      if (config)
        await ctx.credentials.set("SCANF_READER_MODEL", JSON.stringify(config));
      else await ctx.credentials.unset("SCANF_READER_MODEL");
    },
  });
  const readers = new Map<
    string,
    Promise<Awaited<ReturnType<typeof startLocalReader>>>
  >();
  let disposed = false;
  const connect = async (sessionId: string, selectedRoot?: string) => {
    if (disposed) throw new Error("插件已卸载，请重新打开阅读面板。");
    const stored = await ctx.sessionPersistence.stat(sessionId);
    if (!stored?.header.cwd)
      throw new Error("当前会话没有项目目录，请先在 DSH 中选择项目。");
    if (
      selectedRoot !== undefined &&
      (typeof selectedRoot !== "string" ||
        selectedRoot.length > 4096 ||
        !isAbsolute(selectedRoot) ||
        selectedRoot.includes("\0"))
    )
      throw new Error("请选择完整的项目文件夹路径。");
    const root = await realpath(selectedRoot ?? stored.header.cwd);
    if (!(await stat(root)).isDirectory())
      throw new Error("当前会话的项目目录不可用。");
    if (disposed) throw new Error("插件已卸载。");
    let reader = readers.get(root);
    if (!reader) {
      if (readers.size >= 4)
        throw new Error("已打开 4 个项目，请重新加载插件后切换项目。");
      reader = readFile(new URL("./reader.html", import.meta.url), "utf8").then(
        (html) => startLocalReader(root, html, 0, model),
      );
      readers.set(root, reader);
      reader.catch(() => {
        if (readers.get(root) === reader) readers.delete(root);
      });
    }
    const service = await reader;
    if (disposed) throw new Error("插件已卸载。");
    return { url: service.url };
  };
  ctx.connection.fetch.register({
    path: "/api/scanf/connect",
    methods: ["POST"],
    requestBody: "buffered",
    async fetch(request) {
      let rpcId = "";
      try {
        const data = await request.json();
        if (
          data.type !== "client-request" ||
          typeof data.rpcId !== "string" ||
          typeof data.payload?.sessionId !== "string" ||
          !data.payload.sessionId ||
          data.payload.sessionId.length > 256
        )
          throw new Error("无效会话身份。");
        rpcId = data.rpcId;
        return Response.json({
          type: "server-response",
          rpcId,
          result: {
            ok: true,
            value: await connect(data.payload.sessionId, data.payload.root),
          },
        });
      } catch (error) {
        return Response.json({
          type: "server-response",
          rpcId,
          result: {
            ok: false,
            error: {
              code: "scanf/connect-failed",
              message: String(error),
              details: {},
            },
          },
        });
      }
    },
  });
  ctx.effect(
    () => async () => {
      disposed = true;
      await Promise.allSettled(
        [...readers.values()].map(async (reader) => (await reader).close()),
      );
      readers.clear();
    },
    "Scanf automatic project readers",
  );
}
