function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function escapeXml(str) {
  return escapeHtml(str);
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(d);
}

function postCard(post) {
  const img = post.image
    ? `<img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" loading="lazy" style="width:100%;height:160px;object-fit:cover;" />`
    : `<div class="card-img">&#128221;</div>`;
  return `
      <a class="card" href="/blog/${escapeHtml(post.slug)}/" style="text-decoration:none;color:inherit;display:block;">
        ${img}
        <div class="card-body">
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(post.description)}</p>
          <span class="price">${escapeHtml(formatDate(post.publishedAt))}</span>
        </div>
      </a>`;
}

// Reuses index.html's orange theme (CSS vars, nav, .card / .menu-grid
// patterns) so the blog listing looks like it belongs to the same site.
export function renderListingPage(posts, { siteBaseUrl } = {}) {
  const sorted = [...posts].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const canonical = siteBaseUrl ? `${siteBaseUrl.replace(/\/$/, "")}/blog/` : "/blog/";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Blog | Ember &amp; Roast</title>
  <meta name="description" content="Stories, brewing guides, and news from Ember &amp; Roast." />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --orange: #f97316; --orange-dark: #c2410c; --orange-light: #ffedd5;
      --orange-mid: #fb923c; --brown: #431407; --cream: #fff7ed;
      --text: #1c0a00; --muted: #78350f;
    }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--cream); color: var(--text); }
    nav { background: var(--brown); display: flex; justify-content: space-between; align-items: center; padding: 1rem 6%; position: sticky; top: 0; z-index: 100; }
    .logo { font-size: 1.5rem; font-weight: 700; color: var(--orange-mid); letter-spacing: 1px; }
    .logo span { color: #fff; }
    nav ul { list-style: none; display: flex; gap: 2rem; }
    nav ul a { color: #fde8d0; text-decoration: none; font-size: 0.95rem; transition: color 0.2s; }
    nav ul a:hover { color: var(--orange-mid); }
    main { padding: 5rem 6%; }
    .section-title { text-align: center; margin-bottom: 3rem; }
    .section-title h2 { font-size: 2.2rem; color: var(--orange-dark); margin-bottom: 0.5rem; }
    .section-title p { color: var(--muted); font-size: 1rem; }
    .menu-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.8rem; }
    .card { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.07); transition: transform 0.2s, box-shadow 0.2s; }
    .card:hover { transform: translateY(-6px); box-shadow: 0 12px 32px rgba(249,115,22,0.18); }
    .card-img { height: 160px; display: flex; align-items: center; justify-content: center; font-size: 5rem; background: var(--orange-light); }
    .card-body { padding: 1.2rem; }
    .card-body h3 { font-size: 1.1rem; margin-bottom: 0.4rem; color: var(--brown); }
    .card-body p { font-size: 0.88rem; color: #666; line-height: 1.5; margin-bottom: 0.8rem; }
    .price { font-weight: 700; color: var(--orange); font-size: 0.85rem; }
    .empty { text-align: center; color: var(--muted); padding: 3rem 0; }
    footer { background: #1c0a00; color: #fde8d0; text-align: center; padding: 1.5rem; font-size: 0.88rem; }
    footer span { color: var(--orange-mid); }
  </style>
</head>
<body>
  <nav>
    <div class="logo"><a href="/" style="color:inherit;text-decoration:none;">Ember <span>&amp;</span> Roast</a></div>
    <ul>
      <li><a href="/#menu">Menu</a></li>
      <li><a href="/#about">About</a></li>
      <li><a href="/blog/">Blog</a></li>
      <li><a href="/#contact">Contact</a></li>
    </ul>
  </nav>
  <main>
    <div class="section-title">
      <h2>From the Blog</h2>
      <p>Stories, brewing guides, and news from the roastery</p>
    </div>
    <div class="menu-grid">
${sorted.length ? sorted.map(postCard).join("\n") : ""}
    </div>
    ${sorted.length ? "" : '<p class="empty">No posts yet — check back soon.</p>'}
  </main>
  <footer>
    &copy; ${new Date().getFullYear()} <span>Ember &amp; Roast</span>. All rights reserved.
  </footer>
</body>
</html>
`;
}

export function renderSitemap(posts, siteBaseUrl) {
  const base = siteBaseUrl.replace(/\/$/, "");
  const urls = [
    `  <url><loc>${escapeXml(base)}/</loc></url>`,
    `  <url><loc>${escapeXml(base)}/blog/</loc></url>`,
    ...posts.map(
      (p) =>
        `  <url><loc>${escapeXml(base)}/blog/${escapeXml(p.slug)}/</loc><lastmod>${escapeXml(
          (p.updatedAt || p.publishedAt || "").slice(0, 10)
        )}</lastmod></url>`
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
    "\n"
  )}\n</urlset>\n`;
}
