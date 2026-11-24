import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { ProjectReader } from "./project";
import type { ReaderView } from "./reader-model";
import type { ModelService } from "./model-service";
/** Starts a scoped loopback reader owned by the embedding host. */
export async function startLocalReader(
  root: string,
  html: string,
  port = 0,
  model?: ModelService,
) {
  const project = new ProjectReader(root);
  const token = randomBytes(24).toString("hex");
  const http = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const host = req.headers.host ?? "";
    if (
      !/^127\.0\.0\.1:\d+$/.test(host) ||
      (req.headers.origin && req.headers.origin !== `http://${host}`)
    ) {
      res.writeHead(403).end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://" + host);
    if (req.method === "GET" && url.pathname === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end();
      return;
    }
    if (req.method !== "POST" || url.pathname !== "/api") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16000) {
          res.writeHead(413).end();
          return;
        }
      }
      const data = JSON.parse(body);
      await project.refresh();
      if (data.action === "model") {
        if (!model)
          throw new Error(
            "当前宿主未提供模型设置，请在 VS Code 或 DSH 插件中使用。",
          );
        const result = await model.action(
          data.operation,
          data.payload,
          (id, revision) => {
            const previous = project.selected;
            try {
              return project.inspect(id, revision);
            } finally {
              project.selected = previous;
            }
          },
        );
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ result }));
        return;
      }
      let view: ReaderView;
      view =
        data.action === "inspect"
          ? project.inspect(String(data.id), data.revision)
          : project.view();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ view }));
    } catch (error) {
      res
        .writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, "127.0.0.1", resolve);
  });
  const address = http.address();
  if (!address || typeof address === "string")
    throw new Error("无法启动本地预览。");

  return {
    url: `http://127.0.0.1:${address.port}/#${token}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        http.close((e) => (e ? reject(e) : resolve()));
        http.closeAllConnections();
      }),
  };
}
