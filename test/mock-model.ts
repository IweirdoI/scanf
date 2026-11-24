import { createServer } from "node:http";
/** Transport fixture only. Its canned reply is never evidence of model quality. */
export async function startMockModel() {
  const calls: any[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    calls.push({
      body,
      authorized: req.headers.authorization === "Bearer scanf-test-key",
      path: req.url,
    });
    if (body.model === "unauthorized") {
      res.writeHead(401).end("private-provider-error");
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "[本机模拟接口] L4：items 是传入的商品列表；这里计算数量与价格。此文本仅用于验证调用和悬停显示。",
            },
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("mock startup failed");
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    calls,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
