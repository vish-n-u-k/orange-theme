import { env } from "./env.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `You format a plain-text blog draft into clean semantic HTML for a blog post body.

Rules:
- Preserve the author's wording as closely as possible — this is light formatting, not a rewrite. Do not add, cut, or reword sentences.
- Split into <p> paragraphs at natural paragraph breaks. Fix only obviously broken paragraphing.
- You may add up to 2 <h2> subheadings if there are clear topic shifts, using wording drawn from the text itself.
- Output ONLY the inner HTML for the article body — no <html>, <head>, <body>, no markdown, no code fences, no commentary before or after.
- Escape any literal < or > characters that appear in the source text as prose.`;

// Frekto's body is plain text with no markup; light formatting into HTML is
// the one place this pipeline uses an LLM, deliberately kept minimal so the
// published wording stays close to what was actually drafted.
export async function formatBodyToHtml({ title, body, primaryKeyword }) {
  const userMessage = `Title: ${title}\n${
    primaryKeyword ? `Primary keyword (context only, do not force it in): ${primaryKeyword}\n` : ""
  }\n---\n\n${body}`;

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: HTTP ${res.status} ${await res.text()}`);
  }

  const json = await res.json();

  if (json.stop_reason === "refusal") {
    throw new Error("Anthropic API declined to format this content");
  }

  const textBlock = (json.content || []).find((b) => b.type === "text");
  if (!textBlock || !textBlock.text.trim()) {
    throw new Error("Anthropic API returned no formatted content");
  }

  return textBlock.text.trim();
}
