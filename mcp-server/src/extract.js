const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Canonical path must look like /blog/<slug>/ or /blog/<slug> — that's the
// unambiguous anchor the whole publish flow (path, idempotency key, listing
// entry) is derived from.
export function parseCanonicalSlug(canonicalHref) {
  if (!canonicalHref) return { slug: null, error: "no canonical URL" };

  let url;
  try {
    // Canonical tags are usually absolute, but tolerate a bare path too.
    url = new URL(canonicalHref, "https://placeholder.invalid");
  } catch {
    return { slug: null, error: `canonical URL is not parseable: "${canonicalHref}"` };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || segments[0] !== "blog") {
    return {
      slug: null,
      error: `canonical URL path must look like /blog/<slug>/, got "${url.pathname}"`,
    };
  }

  const slug = segments[1];
  if (!SLUG_RE.test(slug)) {
    return {
      slug: null,
      error: `slug "${slug}" (from canonical URL) must be lowercase letters, digits, and hyphens only`,
    };
  }

  return { slug, origin: url.origin === "https://placeholder.invalid" ? null : url.origin, error: null };
}

function metaContent($, selector) {
  const val = $(selector).first().attr("content");
  return val && val.trim() ? val.trim() : null;
}

export function extractPostData($) {
  const canonicalHref = $('link[rel="canonical"]').first().attr("href") || null;
  const { slug, origin } = parseCanonicalSlug(canonicalHref);

  const title =
    metaContent($, 'meta[property="og:title"]') ||
    ($("title").first().text() || "").trim() ||
    null;

  const description =
    metaContent($, 'meta[property="og:description"]') ||
    metaContent($, 'meta[name="description"]') ||
    null;

  const image = metaContent($, 'meta[property="og:image"]');

  const publishedAt =
    metaContent($, 'meta[property="article:published_time"]') ||
    $("time[datetime]").first().attr("datetime") ||
    null;

  const updatedAt = metaContent($, 'meta[property="article:modified_time"]') || null;

  return {
    slug,
    canonicalHref,
    canonicalOrigin: origin,
    title,
    description,
    image,
    publishedAt,
    updatedAt,
  };
}
