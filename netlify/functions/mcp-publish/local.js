// Plain local runner, independent of the Netlify CLI. Prefer `netlify dev`
// from the repo root for local testing (it matches the deployed runtime
// and serves the static site at the same time) — this is a fallback for
// quickly exercising mcp-core.js directly.
import http from "node:http";
import { handleMcpRequest } from "./mcp-core.js";
import { env } from "./env.js";

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = chunks.length ? Buffer.concat(chunks).toString("utf8") : null;

  const { status, body } = await handleMcpRequest({
    method: req.method,
    headers: req.headers,
    rawBody,
  });

  res.writeHead(status, { "content-type": "application/json" });
  res.end(body ?? "");
});

server.listen(env.port, () => {
  console.log(`orange-theme blog publish server (local) listening on port ${env.port}`);
});
