# mcp-publish (Netlify Function)

A webhook Frekto calls to publish blog posts to this site. Despite "MCP
Server URL" in Frekto's own settings UI, the actual wire contract is a
plain HTTP POST — not MCP, not JSON-RPC. Runs as a Netlify Function in the
same site/repo that already auto-deploys on push to `main` — no separate
hosting platform.

```
Frekto
  → POST https://<your-site>/mcp  (netlify.toml rewrites this to the function)
    Authorization: Bearer <MCP_AUTH_TOKEN>
    { "tool": "publish_post", "input": { title, body, meta_description,
      primary_keyword, tags, status, featured_image } }
  → validates input
  → formats body (plain text) into HTML via Claude — light formatting only
  → mirrors featured_image into the repo (skipped with a warning if it's a
    video — see "Known limitation" below)
  → commits blog/<slug>/index.html (+ image, + listing/sitemap if new) to
    main via the GitHub Contents API
  → existing Netlify auto-deploy picks it up
  → responds { success: true, post_id, post_url } (or { error } on failure)
```

## Three separate secrets

1. **`MCP_AUTH_TOKEN`** — a value you make up yourself (e.g.
   `openssl rand -hex 32`). Enter the same value as the "Auth Token" in
   Frekto's Blog/CMS integration settings. **Frekto only sends the
   `Authorization` header if you configure a token there** — since this
   server always requires one, every call 401s until you do.
2. **`GITHUB_TOKEN`** — a GitHub fine-grained Personal Access Token,
   scoped to **only this repo**, with **Contents: Read and write**
   permission and nothing else. Used to commit. Frekto never sees it.
3. **`ANTHROPIC_API_KEY`** — a Claude API key, used to turn Frekto's
   plain-text `body` into paragraph HTML. Get one at
   [console.anthropic.com](https://console.anthropic.com).

### Where to set them

**Netlify (production):** Site configuration → Environment variables →
add `MCP_AUTH_TOKEN`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `GITHUB_OWNER`,
`GITHUB_REPO`, `GITHUB_BRANCH`, and (optional) `SITE_BASE_URL`.

**Local testing:** copy `.env.example` (repo root) to `.env` — `netlify
dev` reads it automatically.

## What Frekto actually sends

```json
{
  "tool": "publish_post",
  "input": {
    "title": "Why Most Automation Tools Failed My Clients",
    "body": "Full article body text — 400-600 words, plain text, no markup.",
    "meta_description": "SEO description, ~150-160 chars.",
    "primary_keyword": "social media automation",
    "tags": ["Automation", "SmallBusiness", "ContentMarketing"],
    "status": "draft",
    "featured_image": "https://cdn.frekto.ai/renders/job_xxx.mp4"
  }
}
```

No HTML, no canonical URL, no slug — this server is entirely responsible
for turning those seven fields into an actual page.

## What `publish_post` does per call

1. Validates `title`, `body` (min length), and `meta_description` as hard
   requirements — nothing reviews the commit afterward, so a missing field
   blocks the publish (`422`) rather than warning. `tags`,
   `primary_keyword`, and `featured_image` are optional.
2. Derives the slug from `title` (slugified) — there's no canonical URL or
   ID in the payload to use instead.
3. Formats `body` into HTML via Claude (`claude-opus-5`, low effort,
   light-formatting-only prompt): paragraph breaks and up to two `<h2>`
   subheadings, wording otherwise preserved as drafted.
4. Mirrors `featured_image` into `blog/<slug>/images/cover.<ext>` if it's
   a static image. If it's a video (by extension or content-type) or the
   fetch fails, that's a warning, not a blocker — the post publishes
   without a featured image.
5. Renders the full post page from title/description/formatted
   body/tags/image, matching this site's existing orange theme.
6. Is idempotent by slug: a new slug creates the post and updates
   `blog/posts.json` (the manifest driving the listing page),
   `blog/index.html` (listing), and `sitemap.xml`. Republishing an
   existing slug (retries are common against Frekto's 15s timeout) just
   overwrites that one post file — no other side effects.
7. Commits directly to `main` — no PR, no review gate. Frekto's spec says
   it always sends `status: "draft"` and explicitly allows the server to
   override that; this server always publishes live, since a git-committed
   static site has no draft state to represent instead.

## Known limitation: video thumbnails

`featured_image` can be an MP4 render, and Frekto's spec says to extract a
thumbnail frame when the CMS needs a static image. That isn't implemented
here — running `ffmpeg` in a Netlify Function adds real size and latency
risk against Frekto's 15-second response budget, so a video URL is
currently a warning (post publishes without a featured image), not a hard
requirement. Revisit if featured images are video often enough to matter.

## Running locally

From the repo root, with the [Netlify CLI](https://docs.netlify.com/cli/get-started/)
installed:

```bash
cp .env.example .env   # fill in MCP_AUTH_TOKEN, GITHUB_TOKEN, ANTHROPIC_API_KEY, SITE_BASE_URL
netlify dev
```

This serves the static site and the function together, matching the
deployed runtime. The endpoint is `http://localhost:8888/mcp`.

Without the Netlify CLI, run the same logic as a plain Node HTTP server:

```bash
cd netlify/functions/mcp-publish
npm install
npm start   # listens on PORT (default 3000)
```

### Why no framework here

The whole function is one POST endpoint handling one JSON body at a time
— no routing, no protocol negotiation, no dependencies beyond built-in
`fetch`. `webhook-core.js` is the framework-agnostic core
(`handleWebhookRequest({method, headers, rawBody}) -> {status, body}`);
`mcp-publish.js` (Netlify handler) and `local.js` (plain
`http.createServer`) are both thin adapters over it.

## GitHub token setup

1. GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token.
2. Repository access: **Only select repositories** → this repo only.
3. Permissions: **Contents → Read and write**. Nothing else.
4. Copy the token into `GITHUB_TOKEN`.

## Frekto setup

Settings → Integrations → Blog / CMS card:

- **MCP Server URL** — `https://<your-site>.netlify.app/mcp`
- **Publish Tool Name** — leave as `publish_post` (must match what this
  server checks for)
- **Auth Token** — the same value as `MCP_AUTH_TOKEN`

## Not yet wired up

`index.html`'s nav doesn't link to `/blog/` yet — that's a one-time manual
edit to the existing page, left out of this automated pipeline
deliberately. Add a `<li><a href="/blog/">Blog</a></li>` to the nav
whenever you want it discoverable from the homepage.
