const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const FETCH_TIMEOUT_MS = 5_000; // Frekto's own 15s budget covers this whole call.

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv"]);

function isExternal(url) {
  return !!url && /^https?:\/\//i.test(url);
}

function extFromUrl(url) {
  const match = url.pathname.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : null;
}

function looksLikeVideo(url) {
  const ext = extFromUrl(url);
  return !!ext && VIDEO_EXTENSIONS.has(ext);
}

async function fetchBinary(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) {
      throw new Error(`file too large (${buf.length} bytes, max ${MAX_IMAGE_BYTES})`);
    }
    return { buffer: buf, contentType };
  } finally {
    clearTimeout(timer);
  }
}

// Frekto's featured_image may be a static image or an MP4 render. Per the
// chosen default, video thumbnail extraction isn't implemented — a video
// URL (or a video content-type) is a warning, not a blocker, and the post
// publishes without a featured image rather than failing the whole call.
export async function mirrorFeaturedImage(url, slug) {
  if (!url) return { path: null, files: [], warning: null };

  if (!isExternal(url)) {
    return { path: null, files: [], warning: `featured_image "${url}" is not an http(s) URL — ignoring.` };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { path: null, files: [], warning: `featured_image URL is not parseable: "${url}" — ignoring.` };
  }

  if (looksLikeVideo(parsed)) {
    return {
      path: null,
      files: [],
      warning: `featured_image "${url}" looks like a video; thumbnail extraction isn't implemented, so the post publishes without a featured image.`,
    };
  }

  try {
    const { buffer, contentType } = await fetchBinary(parsed.toString());
    if (contentType.startsWith("video/")) {
      return {
        path: null,
        files: [],
        warning: `featured_image "${url}" served content-type ${contentType} (video); publishing without a featured image.`,
      };
    }
    const ext = EXT_BY_MIME[contentType] || extFromUrl(parsed) || "jpg";
    const filename = `cover.${ext}`;
    const path = `blog/${slug}/images/${filename}`;
    const publicPath = `/blog/${slug}/images/${filename}`;
    return { path: publicPath, files: [{ path, base64: buffer.toString("base64") }], warning: null };
  } catch (err) {
    return {
      path: null,
      files: [],
      warning: `Failed to fetch featured_image ${url}: ${err.message}. Publishing without a featured image.`,
    };
  }
}
