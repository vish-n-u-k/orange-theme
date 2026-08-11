import crypto from "node:crypto";
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

// Despite the "MCP Server URL" naming in Frekto's own settings UI, the
// actual wire contract is a plain webhook: POST {tool, input} in,
// {success, post_id, post_url} or {error} out, judged by HTTP status code.
// There is no JSON-RPC/MCP protocol here at all.
export async function handleWebhookRequest({ method, headers, rawBody }) {
  if (method === "GET") {
    return { status: 200, body: "ok" };
  }

  if (method !== "POST") {
    return { status: 405, body: JSON.stringify({ error: "method not allowed" }) };
  }

  // Frekto only sends the Authorization header when an auth token is
  // configured on its side — since this server always requires one, an
  // unconfigured Frekto integration will 401 on every call until set.
  if (!isAuthorized(headers)) {
    return { status: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return { status: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!payload || typeof payload !== "object") {
    return { status: 400, body: JSON.stringify({ error: "Missing request body" }) };
  }

  if (payload.tool !== "publish_post") {
    return { status: 400, body: JSON.stringify({ error: `Unsupported tool "${payload.tool}"` }) };
  }

  try {
    const result = await publishPost(payload.input || {});
    return {
      status: 200,
      body: JSON.stringify({
        success: true,
        post_id: result.slug,
        post_url: result.url,
        warnings: result.warnings,
      }),
    };
  } catch (err) {
    if (err instanceof PublishError) {
      return { status: 422, body: JSON.stringify({ error: err.errors.join("; ") }) };
    }
    console.error("publish_post failed:", err);
    return { status: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
}
