import { validateInput } from "./validate.js";
import { slugify } from "./slug.js";
import { formatBodyToHtml } from "./ai.js";
import { mirrorFeaturedImage } from "./images.js";
import { getFile, putFile } from "./github.js";
import { renderPostPage, renderListingPage, renderSitemap } from "./templates.js";
import { env } from "./env.js";

export class PublishError extends Error {
  constructor(errors) {
    super(`Validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "PublishError";
    this.errors = errors;
  }
}

const MANIFEST_PATH = "blog/posts.json";
const LISTING_PATH = "blog/index.html";
const SITEMAP_PATH = "sitemap.xml";

async function loadManifest() {
  const file = await getFile(MANIFEST_PATH);
  if (!file) return { posts: [] };
  const json = JSON.parse(Buffer.from(file.contentBase64, "base64").toString("utf8"));
  return { posts: Array.isArray(json) ? json : [] };
}

async function putFileByPath(path, content, message) {
  const existing = await getFile(path);
  return putFile({ path, base64Content: Buffer.from(content, "utf8").toString("base64"), message, sha: existing?.sha });
}

// create-or-update by slug: a new slug creates the post plus updates the
// manifest/listing/sitemap; re-publishing an existing slug only overwrites
// that post's file, so retries (Frekto's 15s timeout can produce them) are
// safe and never duplicate side effects.
//
// Frekto always sends status: "draft" but explicitly allows the server to
// override that behavior. This server always commits straight to main —
// there's no draft state a static git-committed site can represent, and
// direct-commit was the deliberate choice made for this pipeline.
export async function publishPost(input) {
  const { valid, errors, warnings: validationWarnings } = validateInput(input);
  if (!valid) throw new PublishError(errors);

  const warnings = [...validationWarnings];
  const title = input.title.trim();
  const body = input.body.trim();
  const description = input.meta_description.trim();
  const tags = Array.isArray(input.tags) ? input.tags.map(String) : [];
  const primaryKeyword = typeof input.primary_keyword === "string" ? input.primary_keyword.trim() || null : null;

  const slug = slugify(title);
  if (!slug) throw new PublishError([`Could not derive a URL slug from title "${title}".`]);

  // Run AI formatting and the featured-image fetch concurrently — both are
  // independent and this pipeline is racing Frekto's 15s response budget.
  const [bodyHtml, imageResult] = await Promise.all([
    formatBodyToHtml({ title, body, primaryKeyword }),
    mirrorFeaturedImage(input.featured_image, slug),
  ]);
  if (imageResult.warning) warnings.push(imageResult.warning);

  const publishedAt = new Date().toISOString();
  const canonicalUrl = env.siteBaseUrl
    ? `${env.siteBaseUrl.replace(/\/$/, "")}/blog/${slug}/`
    : `/blog/${slug}/`;
  const postPath = `blog/${slug}/index.html`;

  const existingPost = await getFile(postPath);
  const isNew = !existingPost;

  for (const file of imageResult.files) {
    const existingImage = await getFile(file.path);
    await putFile({
      path: file.path,
      base64Content: file.base64,
      message: `chore(blog): mirror featured image for ${slug}`,
      sha: existingImage?.sha,
    });
  }

  const html = renderPostPage({
    title,
    description,
    bodyHtml,
    canonicalUrl,
    image: imageResult.path,
    tags,
    publishedAt,
    primaryKeyword,
  });

  const postResult = await putFile({
    path: postPath,
    base64Content: Buffer.from(html, "utf8").toString("base64"),
    message: isNew ? `blog: publish "${title}"` : `blog: update "${title}"`,
    sha: existingPost?.sha,
  });

  if (isNew) {
    const { posts } = await loadManifest();
    const entry = { slug, title, description, image: imageResult.path, tags, publishedAt, updatedAt: publishedAt };
    const nextPosts = [...posts.filter((p) => p.slug !== slug), entry];

    await putFileByPath(
      MANIFEST_PATH,
      JSON.stringify(nextPosts, null, 2),
      `blog: add "${title}" to post manifest`
    );
    await putFileByPath(
      LISTING_PATH,
      renderListingPage(nextPosts, { siteBaseUrl: env.siteBaseUrl }),
      `blog: update listing page for "${title}"`
    );

    if (env.siteBaseUrl) {
      await putFileByPath(
        SITEMAP_PATH,
        renderSitemap(nextPosts, env.siteBaseUrl),
        `blog: update sitemap for "${title}"`
      );
    } else {
      warnings.push("SITE_BASE_URL not configured on the server; skipped sitemap.xml update.");
    }
  }

  return {
    status: isNew ? "created" : "updated",
    slug,
    path: `/blog/${slug}/`,
    url: canonicalUrl,
    title,
    commitSha: postResult.commitSha,
    imageMirrored: imageResult.files.length > 0,
    listingAndSitemapUpdated: isNew,
    warnings,
  };
}
