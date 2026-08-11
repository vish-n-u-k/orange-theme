// Frekto sends no canonical URL or slug — the post's identity has to come
// from somewhere unambiguous in the payload, so it's derived from the title.
export function slugify(title) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
