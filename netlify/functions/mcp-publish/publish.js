import * as cheerio from "cheerio";
import { validatePost } from "./validate.js";
import { extractPostData } from "./extract.js";
import { mirrorImages } from "./images.js";
import { getFile, putFile } from "./github.js";
import { renderListingPage, renderSitemap } from "./templates.js";
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
  if (!file) return { posts: [], sha: null };
  const json = JSON.parse(Buffer.from(file.contentBase64, "base64").toString("utf8"));
  return { posts: Array.isArray(json) ? json : [], sha: file.sha };
}

async function putFileByPath(path, content, message) {
  const existing = await getFile(path);
  return putFile({ path, base64Content: Buffer.from(content, "utf8").toString("base64"), message, sha: existing?.sha });
}

// create-or-update by slug: a new slug creates the post plus updates the
// manifest/listing/sitemap; re-publishing an existing slug only overwrites
// that post's file, so retries are safe and never duplicate side effects.
export async function publishPost(html) {
  const $ = cheerio.load(html);

  const { valid, errors, warnings: validationWarnings } = validatePost($);
  if (!valid) throw new PublishError(errors);

  const data = extractPostData($);
  const { slug } = data;
  const warnings = [...validationWarnings];

  const { files: imageFiles, warnings: imageWarnings } = await mirrorImages($, slug);
  warnings.push(...imageWarnings);

  const finalHtml = $.html();
  const postPath = `blog/${slug}/index.html`;
  const existingPost = await getFile(postPath);
  const isNew = !existingPost;

  // Commit images before the post so the post HTML never points at a path
  // that doesn't exist yet in the repo.
  for (const file of imageFiles) {
    const existingImage = await getFile(file.path);
    await putFile({
      path: file.path,
      base64Content: file.base64,
      message: `chore(blog): mirror image for ${slug}`,
      sha: existingImage?.sha,
    });
  }

  const postResult = await putFile({
    path: postPath,
    base64Content: Buffer.from(finalHtml, "utf8").toString("base64"),
    message: isNew ? `blog: publish "${data.title}"` : `blog: update "${data.title}"`,
    sha: existingPost?.sha,
  });

  if (isNew) {
    const { posts } = await loadManifest();
    const entry = {
      slug,
      title: data.title,
      description: data.description,
      image: $('meta[property="og:image"]').first().attr("content") || null,
      publishedAt: data.publishedAt,
      updatedAt: data.updatedAt || data.publishedAt,
    };
    const nextPosts = [...posts.filter((p) => p.slug !== slug), entry];

    await putFileByPath(
      MANIFEST_PATH,
      JSON.stringify(nextPosts, null, 2),
      `blog: add "${data.title}" to post manifest`
    );
    await putFileByPath(
      LISTING_PATH,
      renderListingPage(nextPosts, { siteBaseUrl: env.siteBaseUrl }),
      `blog: update listing page for "${data.title}"`
    );

    if (env.siteBaseUrl) {
      await putFileByPath(
        SITEMAP_PATH,
        renderSitemap(nextPosts, env.siteBaseUrl),
        `blog: update sitemap for "${data.title}"`
      );
    } else {
      warnings.push("SITE_BASE_URL not configured on the MCP server; skipped sitemap.xml update.");
    }
  }

  return {
    status: isNew ? "created" : "updated",
    slug,
    path: `/blog/${slug}/`,
    title: data.title,
    commitSha: postResult.commitSha,
    imagesMirrored: imageFiles.length,
    listingAndSitemapUpdated: isNew,
    warnings,
  };
}
