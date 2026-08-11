import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { env } from "./env.js";
import { publishPost, PublishError } from "./publish.js";

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isAuthorized(headers) {
  const authHeader = headers?.authorization || headers?.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return !!token && timingSafeEqual(token, env.mcpAuthToken);
}

function buildMcpServer() {
  const server = new McpServer({
    name: "orange-theme-blog-publish",
    version: "1.0.0",
  });

  server.registerTool(
    "publish_post",
    {
      title: "Publish blog post",
      description:
        "Publishes (creates or updates) a blog post on the orange-theme site by committing it directly to the main branch, " +
        "which triggers the site's existing auto-deploy. Input is a single fully-formed HTML page (not a content fragment). " +
        "The post's URL/slug is derived from its <link rel=\"canonical\"> tag, which must look like https://.../blog/<slug>/. " +
        "Title, description, image, and publish date are read from the page's <title>, meta description, and " +
        "og:*/article:* meta tags rather than being passed separately. Required tags (title, meta description, canonical, " +
        "og:title, og:description, a publish date) are hard requirements and block the publish if missing or invalid — " +
        "there is no human review step after this call. Publishing the same canonical URL again overwrites that post in " +
        "place (safe to retry); a new canonical URL creates a new post and updates the blog listing page and sitemap.",
      inputSchema: {
        html: z
          .string()
          .min(1)
          .describe("The complete HTML document for the post, including <head> meta tags."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ html }) => {
      try {
        const result = await publishPost(html);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (err) {
        if (err instanceof PublishError) {
          return {
            content: [
              {
                type: "text",
                text: `Publish blocked by validation errors:\n- ${err.errors.join("\n- ")}`,
              },
            ],
            isError: true,
          };
        }
        console.error("publish_post failed:", err);
        return {
          content: [{ type: "text", text: `Publish failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

// A single HTTP request/response is all this endpoint ever needs — one
// JSON-RPC message in, one JSON-RPC message (or nothing, for a
// notification) out. Rather than going through the SDK's Node-HTTP
// transport (which internally bridges Node req/res to Web Standard
// Request/Response via Hono — a layer built for long-lived, potentially
// streaming connections, and a poor fit for a Lambda-style function
// invocation), this implements the small documented Transport interface
// directly in-process: start/send/close/onmessage, no I/O of its own.
function createInProcessTransport() {
  return {
    async start() {},
    async close() {},
    async send() {},
    onmessage: undefined,
    onclose: undefined,
    onerror: undefined,
  };
}

// Processes one already-parsed JSON-RPC message and resolves with the
// response message, or `null` for notifications (which get no response).
async function dispatch(message) {
  const mcpServer = buildMcpServer();
  const transport = createInProcessTransport();
  const isNotification = message && typeof message === "object" && message.id === undefined;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    transport.send = async (msg) => {
      settle(resolve, msg);
    };
    transport.onerror = (err) => settle(reject, err);

    mcpServer
      .connect(transport)
      .then(() => {
        transport.onmessage(message);
        if (isNotification) settle(resolve, null);
      })
      .catch((err) => settle(reject, err));
  });
}

// Framework-agnostic core: takes method/headers/rawBody, returns
// { status, body } (body is a string or null). Both the Netlify Function
// handler and the local dev server call this directly.
export async function handleMcpRequest({ method, headers, rawBody }) {
  if (method === "GET") {
    return { status: 200, body: "ok" };
  }

  if (method !== "POST") {
    return { status: 405, body: JSON.stringify({ error: "method not allowed" }) };
  }

  if (!isAuthorized(headers)) {
    return { status: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  let message;
  try {
    message = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return {
      status: 400,
      body: JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error: invalid JSON" },
        id: null,
      }),
    };
  }

  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return {
      status: 400,
      body: JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid Request: expected a single JSON-RPC message object" },
        id: null,
      }),
    };
  }

  try {
    const response = await dispatch(message);
    if (response === null) {
      // Notification (e.g. notifications/initialized) — no response body.
      return { status: 202, body: "" };
    }
    return { status: 200, body: JSON.stringify(response) };
  } catch (err) {
    console.error("MCP request failed:", err);
    return {
      status: 500,
      body: JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: message.id ?? null,
      }),
    };
  }
}
