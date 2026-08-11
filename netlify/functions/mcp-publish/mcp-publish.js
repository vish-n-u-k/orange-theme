import { handleMcpRequest } from "./mcp-core.js";

// Classic Lambda-compatible Netlify Function handler.
export const handler = async (event) => {
  const rawBody = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body
    : null;

  const { status, body } = await handleMcpRequest({
    method: event.httpMethod,
    headers: event.headers || {},
    rawBody,
  });

  return {
    statusCode: status,
    headers: { "content-type": "application/json" },
    body: body ?? "",
  };
};
