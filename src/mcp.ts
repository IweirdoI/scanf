import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { ProjectReader } from "./project";
import type { ReaderView } from "./reader-model";

const UI = "ui://scanf/reader-v1.html";
const mimeType = "text/html;profile=mcp-app";
const evidenceSchema = z
  .array(
    z.object({
      line: z.number().int().positive(),
      endLine: z.number().int().positive(),
    }),
  )
  .min(1)
  .max(10);
const explanationSchema = {
  id: z.string(),
  revision: z.string(),
  text: z.string().min(1).max(4000),
  evidence: evidenceSchema,
  parameters: z
    .array(
      z.object({
        name: z.string().max(200),
        text: z.string().min(1).max(1500),
        evidence: evidenceSchema,
      }),
    )
    .max(30)
    .optional(),
};
/** 为 Agent 提供读取源码、查符号、发布解释和打开阅读窗口的 MCP 服务。
 * @param project 已绑定明确项目根目录的阅读会话，负责扫描、版本校验、源码与解释状态。
 * @param html 已打包的自包含阅读界面 HTML，通过 MCP Apps 资源交给宿主显示。
 */
export function createReaderServer(project: ProjectReader, html: string) {
  const server = new McpServer({ name: "scanf-reader", version: "0.6.1" });
  const ensure = async () => project.refresh();
  const result = (view: ReaderView) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          revision: view.revision,
          project: view.project,
          entries: view.entries,
          selected: view.selected,
          source: view.source,
          sourceTruncated: view.sourceTruncated,
          calls: view.calls,
          warnings: view.warnings,
          unresolved: view.unresolved,
        }),
      },
    ],
    structuredContent: { view },
  });
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  server.registerResource("scanf-reader-ui", UI, { mimeType }, async () => ({
    contents: [
      {
        uri: UI,
        mimeType,
        text: html,
        _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
      },
    ],
  }));
  server.registerTool(
    "scanf_project",
    {
      description:
        "Read the bounded TypeScript/JavaScript project structure and a source-backed reading tree. Call before navigating unfamiliar modules. Refreshes the working-tree snapshot; this is not a Git diff or a runtime trace.",
      inputSchema: {},
      annotations,
    },
    async () => result(await ensure()),
  );
  server.registerTool(
    "scanf_find_symbol",
    {
      description:
        "Find exact symbol IDs by name/path. Disambiguate same-named functions using the returned file and ID; never infer a call from a name match.",
      inputSchema: { query: z.string().max(200) },
      annotations,
    },
    async ({ query }) => {
      await ensure();
      const matches = project.map!.nodes.filter((n) =>
        `${n.name} ${n.file}`.toLowerCase().includes(query.toLowerCase()),
      );
      const data = {
        revision: project.revision,
        total: matches.length,
        truncated: matches.length > 30,
        matches: matches
          .slice(0, 30)
          .map(({ id, name, file, line, kind }) => ({
            id,
            name,
            file,
            line,
            kind,
          })),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: data,
      };
    },
  );
  server.registerTool(
    "scanf_inspect",
    {
      description:
        "Read a selected symbol body, source locations, structural steps, unresolved calls and a bounded dependency/call tree. Supply revision from the last result to reject stale selections. Tree order is not runtime execution order.",
      inputSchema: {
        id: z.string().max(4096),
        revision: z.string().optional(),
      },
      annotations,
    },
    async ({ id, revision }) => {
      await ensure();
      return result(project.inspect(id, revision));
    },
  );
  server.registerTool(
    "scanf_publish_explanation",
    {
      description:
        "After reading source through scanf_inspect, explain the function purpose AND each parameter meaning using the optional parameters array. Give evidence lines inside the selected function for every explanation; distinguish inferred business meaning from facts. Stores only in this MCP process memory, never edits source. Refresh the panel to fetch the explanation.",
      inputSchema: explanationSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ id, revision, text, evidence, parameters }) => {
      await ensure();
      return result(project.explain(id, revision, text, evidence, parameters));
    },
  );
  server.registerTool(
    "scanf_open_reader",
    {
      title: "Scanf 代码阅读",
      description:
        "Open the interactive source reading panel for a TS/JS project or selected symbol. Use when the user wants to see project structure, expand call trees or read code alongside this conversation. Works as plain tool output when UI is unavailable.",
      inputSchema: { id: z.string().max(4096).optional() },
      annotations,
      _meta: {
        ui: { resourceUri: UI },
        "openai/ui": { entrypoints: [{ type: "thread" }] },
      },
    },
    async ({ id }) => {
      await ensure();
      return result(id ? project.inspect(id) : project.view());
    },
  );
  return server;
}

async function main() {
  const args = process.argv.slice(2),
    rootIndex = args.indexOf("--root");
  const root =
    rootIndex >= 0 ? args[rootIndex + 1] : process.env.SCANF_PROJECT_ROOT;
  if (!root)
    throw new Error("请用 --root 或 SCANF_PROJECT_ROOT 明确指定项目目录。");
  const project = new ProjectReader(root);
  const html = await fs.readFile(path.join(__dirname, "reader.html"), "utf8");
  if (args.includes("--preview")) {
    const token = randomBytes(24).toString("hex");
    const portIndex = args.indexOf("--port"),
      port = portIndex >= 0 ? Number(args[portIndex + 1]) : 0;
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
        let view: ReaderView;
        if (data.action === "explain") {
          const note = z.object(explanationSchema).parse(data);
          view = project.explain(
            note.id,
            note.revision,
            note.text,
            note.evidence,
            note.parameters,
          );
        } else
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
    process.stderr.write(
      `Scanf local reader: http://127.0.0.1:${address.port}/#${token}\n`,
    );
    return;
  }
  await createReaderServer(project, html).connect(new StdioServerTransport());
}
if (require.main === module)
  main().catch((error) => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  });
