# mcp-publish (Netlify Function)

Exposes one MCP tool, `publish_post`, so an external content tool (Frekto)
can publish blog posts to this site. Runs as a Netlify Function in the
same site/repo that already auto-deploys on push to `main` — no separate
hosting platform.

```
Frekto (MCP client)
  → calls publish_post over MCP, Authorization: Bearer <MCP_AUTH_TOKEN>
  → https://<your-site>/mcp  (netlify.toml rewrites this to the function)
  → this function validates + processes the submitted HTML
  → commits blog/<slug>/index.html (+ mirrored images, + listing/sitemap
    if the post is new) to main via the GitHub Contents API
  → existing Netlify auto-deploy picks it up
  → post is live
```

## Two separate secrets

1. **`MCP_AUTH_TOKEN`** — a value you make up yourself (e.g.
   `openssl rand -hex 32`). Put the same value in Frekto's MCP client
   config and in this Netlify site's env vars. It authenticates Frekto to
   this function. GitHub never sees it.
2. **`GITHUB_TOKEN`** — a GitHub fine-grained Personal Access Token,
   scoped to **only this repo**, with **Contents: Read and write**
   permission and nothing else. This function uses it to commit. Frekto
   never sees it.

### Where to set them

**Netlify (production):** Site configuration → Environment variables →
add `MCP_AUTH_TOKEN`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`,
`GITHUB_BRANCH`, and (optional) `SITE_BASE_URL`. Netlify injects these
into the function at runtime — nothing to deploy or redeploy manually
after adding them, the next invocation just picks them up. Since a
`netlify.toml` now exists in this repo, double check Netlify's build
settings UI doesn't have a conflicting publish directory from before —
`publish = "."` here matches serving `index.html` straight from repo
root, which is what you had already.

**Local testing:** copy `.env.example` (repo root) to `.env` and fill it
in — `netlify dev` reads it automatically.

## What `publish_post` does per call

1. Takes one input: `html`, the complete HTML page for the post (not a
   fragment).
2. Validates it. Since nothing reviews the commit afterwards, every check
   that would normally be a soft warning is a hard error here: missing or
   empty `<title>`, `<meta name="description">`,
   `<link rel="canonical">`, `og:title`, `og:description`, or a publish
   date (`article:published_time` meta or `<time datetime>`) all block the
   publish — nothing is committed. Missing `og:image`/`twitter:card` are
   warnings only.
3. Derives the slug/path from `<link rel="canonical">`, which must look
   like `https://.../blog/<slug>/`. Title, description, image, and date
   come from the meta tags above rather than separate fields.
4. Mirrors externally-hosted images (`og:image` and `<img src="http...">`)
   into `blog/<slug>/images/` and rewrites the HTML to point at the local
   copy. A failed image fetch is a warning, not a blocker — the original
   URL is left hotlinked.
5. Is idempotent by slug: a new slug creates the post and updates
   `blog/posts.json` (the manifest driving the listing page),
   `blog/index.html` (listing), and `sitemap.xml`. Republishing an
   existing slug just overwrites that one post file — no other side
   effects, so retries are safe.
6. Commits directly to `main` — no PR, no review gate. This was a
   deliberate choice (fast path to live); it's why step 2 is strict.

## Running locally

From the repo root, with the [Netlify CLI](https://docs.netlify.com/cli/get-started/)
installed:

```bash
cp .env.example .env   # fill in MCP_AUTH_TOKEN, GITHUB_TOKEN, SITE_BASE_URL
netlify dev
```

This serves the static site and the function together, matching the
deployed runtime. The tool endpoint is `http://localhost:8888/mcp`.

Without the Netlify CLI, you can also run the same protocol logic
directly as a plain Node HTTP server (skips Netlify's event/response
translation, but exercises the same `mcp-core.js`):

```bash
cd netlify/functions/mcp-publish
npm install
npm start   # listens on PORT (default 3000), POST /
```

### Why no Express/framework here

The whole function is one POST endpoint handling one JSON-RPC message at
a time — no routing, no streaming, no sessions. `mcp-core.js` wires the
MCP SDK's `McpServer` directly to a ~10-line in-process transport
(`start`/`send`/`close`/`onmessage`, the transport interface the SDK
itself defines) instead of going through its Node-HTTP transport, which
internally bridges to Web Standard Request/Response for SSE streaming
support this endpoint doesn't need. `mcp-publish.js` (Netlify handler)
and `local.js` (plain `http.createServer`) are both thin adapters calling
into the same `handleMcpRequest()`.

## GitHub token setup

1. GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token.
2. Repository access: **Only select repositories** → this repo only.
3. Permissions: **Contents → Read and write**. Nothing else.
4. Copy the token into `GITHUB_TOKEN`.

## Frekto config

Point Frekto's MCP client at this site's `/mcp` path with the shared
secret:

```json
{
  "mcpServers": {
    "orange-theme-blog": {
      "url": "https://<your-site>.netlify.app/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_AUTH_TOKEN value>"
      }
    }
  }
}
```

(Exact config shape depends on Frekto's MCP client — adjust keys as
needed, the important part is the `Authorization: Bearer` header hitting
`/mcp` on your Netlify site's domain.)

## Not yet wired up

`index.html`'s nav doesn't link to `/blog/` yet — that's a one-time manual
edit to the existing page, left out of this automated pipeline
deliberately. Add a `<li><a href="/blog/">Blog</a></li>` to the nav
whenever you want it discoverable from the homepage.
