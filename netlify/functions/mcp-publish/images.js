const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const FETCH_TIMEOUT_MS = 10_000;

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

function isExternal(src) {
  return !!src && /^https?:\/\//i.test(src);
}

function extFromUrl(url) {
  const match = url.pathname.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : null;
}

async function fetchImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) {
      throw new Error(`image too large (${buf.length} bytes, max ${MAX_IMAGE_BYTES})`);
    }
    return { buffer: buf, contentType };
  } finally {
    clearTimeout(timer);
  }
}

// Mirrors externally-hosted images (og:image + <img> tags) into the repo
// under blog/<slug>/images/, rewriting the HTML in place to point at the
// mirrored copy. A failed fetch is a warning, never a blocking error — the
// original external URL is left in place (hotlinked) instead.
export async function mirrorImages($, slug) {
  const warnings = [];
  const files = []; // { path, base64, sourceUrl }
  const resolvedByUrl = new Map(); // original url -> new public path

  async function mirror(url, filenameBase) {
    if (resolvedByUrl.has(url)) return resolvedByUrl.get(url);

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      warnings.push(`Skipped mirroring invalid image URL: ${url}`);
      return null;
    }

    try {
      const { buffer, contentType } = await fetchImage(parsed.toString());
      const ext = EXT_BY_MIME[contentType] || extFromUrl(parsed) || "jpg";
      const filename = `${filenameBase}.${ext}`;
      const path = `blog/${slug}/images/${filename}`;
      const publicPath = `/blog/${slug}/images/${filename}`;
      files.push({ path, base64: buffer.toString("base64"), sourceUrl: url });
      resolvedByUrl.set(url, publicPath);
      return publicPath;
    } catch (err) {
      warnings.push(`Failed to mirror image ${url}: ${err.message}. Left as external link.`);
      return null;
    }
  }

  const ogImageEl = $('meta[property="og:image"]').first();
  const ogImageUrl = ogImageEl.attr("content");
  if (isExternal(ogImageUrl)) {
    const newPath = await mirror(ogImageUrl, "cover");
    if (newPath) ogImageEl.attr("content", newPath);
  }

  const imgEls = $("img").toArray();
  for (let i = 0; i < imgEls.length; i++) {
    const $el = $(imgEls[i]);
    const src = $el.attr("src");
    if (!isExternal(src)) continue;
    const newPath = await mirror(src, `img-${i + 1}`);
    if (newPath) $el.attr("src", newPath);
  }

  return { files, warnings };
}
