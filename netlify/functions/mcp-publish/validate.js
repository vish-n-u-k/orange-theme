const MIN_BODY_LENGTH = 200; // Frekto sends 400-600 words; this just catches empty/garbage.
const RECOMMENDED_MAX_META_DESCRIPTION = 300;

// Frekto is the only caller and there's no human review before this commits
// to main, so every field it's expected to send becomes a hard requirement
// here rather than a best-effort default.
export function validateInput(input) {
  const errors = [];
  const warnings = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ['Missing or invalid "input" object.'], warnings: [] };
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) errors.push('Missing or empty "title".');

  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) {
    errors.push('Missing or empty "body".');
  } else if (body.length < MIN_BODY_LENGTH) {
    errors.push(`"body" is only ${body.length} characters (minimum ${MIN_BODY_LENGTH}) — too short to be a real post.`);
  }

  const metaDescription = typeof input.meta_description === "string" ? input.meta_description.trim() : "";
  if (!metaDescription) {
    errors.push('Missing or empty "meta_description".');
  } else if (metaDescription.length > RECOMMENDED_MAX_META_DESCRIPTION) {
    warnings.push(`"meta_description" is ${metaDescription.length} characters, longer than the recommended ~160.`);
  }

  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags) || input.tags.some((t) => typeof t !== "string")) {
      errors.push('"tags" must be an array of strings.');
    }
  }

  if (input.featured_image !== undefined && input.featured_image !== null && typeof input.featured_image !== "string") {
    errors.push('"featured_image" must be a string URL.');
  }

  if (input.primary_keyword !== undefined && input.primary_keyword !== null && typeof input.primary_keyword !== "string") {
    errors.push('"primary_keyword" must be a string.');
  }

  return { valid: errors.length === 0, errors, warnings };
}
