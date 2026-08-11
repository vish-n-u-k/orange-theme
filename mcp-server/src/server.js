import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { env } from "./env.js";
import { publishPost, PublishError } from "./publish.js";

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function buildServer() {
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

const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.use("/mcp", (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || !timingSafeEqual(token, env.mcpAuthToken)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

app.post("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.listen(env.port, () => {
  console.log(`orange-theme blog publish MCP server listening on port ${env.port}`);
});
