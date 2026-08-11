import { parseCanonicalSlug } from "./extract.js";

const MIN_BODY_TEXT_LENGTH = 200;

// Every check here blocks the publish. There is no human review step in
// this pipeline (unlike a normal CMS draft), so anything that would
// normally be a soft warning-before-a-human-looks-at-it becomes a hard
// error instead.
export function validatePost($) {
  const errors = [];
  const warnings = [];

  const title = ($("title").first().text() || "").trim();
  if (!title) errors.push('Missing or empty <title>.');

  const metaDescription = $('meta[name="description"]').first().attr("content");
  if (!metaDescription || !metaDescription.trim()) {
    errors.push('Missing or empty <meta name="description">.');
  }

  const canonicalHref = $('link[rel="canonical"]').first().attr("href");
  const { slug, error: canonicalError } = parseCanonicalSlug(canonicalHref);
  if (canonicalError) {
    errors.push(`Invalid <link rel="canonical">: ${canonicalError}`);
  }

  const ogTitle = $('meta[property="og:title"]').first().attr("content");
  if (!ogTitle || !ogTitle.trim()) errors.push('Missing or empty <meta property="og:title">.');

  const ogDescription = $('meta[property="og:description"]').first().attr("content");
  if (!ogDescription || !ogDescription.trim()) {
    errors.push('Missing or empty <meta property="og:description">.');
  }

  const publishedAt =
    $('meta[property="article:published_time"]').first().attr("content") ||
    $("time[datetime]").first().attr("datetime");
  if (!publishedAt) {
    errors.push(
      'Missing publish date: need <meta property="article:published_time" content="ISO-8601"> or a <time datetime="...">.'
    );
  } else if (Number.isNaN(Date.parse(publishedAt))) {
    errors.push(`Publish date "${publishedAt}" is not a valid date.`);
  }

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  if (bodyText.length < MIN_BODY_TEXT_LENGTH) {
    errors.push(
      `<body> text content is only ${bodyText.length} characters (minimum ${MIN_BODY_TEXT_LENGTH}) — looks empty or malformed.`
    );
  }

  const charset = $("meta[charset]").first().attr("charset");
  if (!charset) warnings.push("No <meta charset> found; assuming UTF-8.");

  const viewport = $('meta[name="viewport"]').first().attr("content");
  if (!viewport) warnings.push('No <meta name="viewport"> found.');

  const ogImage = $('meta[property="og:image"]').first().attr("content");
  if (!ogImage) warnings.push('No <meta property="og:image"> — post will publish without a social/listing image.');

  const twitterCard = $('meta[name="twitter:card"]').first().attr("content");
  if (!twitterCard) warnings.push('No <meta name="twitter:card"> found.');

  return { valid: errors.length === 0, errors, warnings, slug };
}
