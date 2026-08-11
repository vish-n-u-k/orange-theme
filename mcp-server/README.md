# orange-theme blog publish MCP server

A small, stateless MCP server exposing one tool, `publish_post`, so an
external content tool (Frekto) can publish blog posts to this site.

This site is plain static HTML with git-push-triggered auto-deploy
(Netlify/Vercel/Pages) — there is no CMS or database. "Publishing" a post
means committing a new `blog/<slug>/index.html` file to `main`; the
existing auto-deploy takes it from there.

```
Frekto (MCP client)
  → calls publish_post over MCP, Authorization: Bearer <MCP_AUTH_TOKEN>
  → this server validates + processes the submitted HTML
  → commits blog/<slug>/index.html (+ mirrored images, + listing/sitemap
    if the post is new) to main via the GitHub Contents API
  → existing auto-deploy picks it up
  → post is live
```

## Two separate secrets

1. **`MCP_AUTH_TOKEN`** — a value you make up yourself (e.g.
   `openssl rand -hex 32`). Put the same value in Frekto's MCP client
   config and in this server's `MCP_AUTH_TOKEN` env var. It authenticates
   Frekto to this server. GitHub never sees it.
2. **`GITHUB_TOKEN`** — a GitHub fine-grained Personal Access Token,
   scoped to **only this repo**, with **Contents: Read and write**
   permission and nothing else. This server uses it to commit. Frekto
   never sees it.

Never reuse one value for both.

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

```bash
cd mcp-server
cp .env.example .env   # fill in MCP_AUTH_TOKEN, GITHUB_TOKEN, SITE_BASE_URL
npm install
npm start
```

The server listens on `POST /mcp` (streamable HTTP transport) and
`GET /healthz` (unauthenticated, for host health checks).

## Deploying

Nothing in this repo implies existing backend infra, so any small host
that gives you (a) a stable public HTTPS URL, (b) env var secrets, (c)
outbound HTTPS works. **Render** is a good default for this: a free/small
Node web service, git-deploy straight from this repo, HTTPS included, env
vars in the dashboard. Railway or Fly.io work the same way if you already
have an account there.

Render setup:

1. New Web Service → connect this GitHub repo.
2. Root directory: `mcp-server`
3. Build command: `npm install`
4. Start command: `npm start`
5. Add env vars: `MCP_AUTH_TOKEN`, `GITHUB_TOKEN`, `GITHUB_OWNER`,
   `GITHUB_REPO`, `GITHUB_BRANCH`, `SITE_BASE_URL`.
6. Deploy. Your MCP endpoint is `https://<service>.onrender.com/mcp`.

## GitHub token setup

1. GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token.
2. Repository access: **Only select repositories** → this repo only.
3. Permissions: **Contents → Read and write**. Nothing else.
4. Copy the token into `GITHUB_TOKEN`.

## Frekto config

Point Frekto's MCP client at this server with the shared secret:

```json
{
  "mcpServers": {
    "orange-theme-blog": {
      "url": "https://<service>.onrender.com/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_AUTH_TOKEN value>"
      }
    }
  }
}
```

(Exact config shape depends on Frekto's MCP client — adjust keys as
needed, the important part is the `Authorization: Bearer` header.)

## Not yet wired up

`index.html`'s nav doesn't link to `/blog/` yet — that's a one-time manual
edit to the existing page, left out of this automated pipeline
deliberately. Add a `<li><a href="/blog/">Blog</a></li>` to the nav
whenever you want it discoverable from the homepage.
