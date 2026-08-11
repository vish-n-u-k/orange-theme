import { env } from "./env.js";

const API_BASE = "https://api.github.com";

function headers() {
  return {
    Authorization: `Bearer ${env.githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "orange-theme-blog-publish-mcp",
    "Content-Type": "application/json",
  };
}

function contentsUrl(path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${API_BASE}/repos/${env.githubOwner}/${env.githubRepo}/contents/${encodedPath}`;
}

// Returns { sha, contentBase64 } for an existing file, or null if it
// doesn't exist yet. Throws on any other API failure.
export async function getFile(path) {
  const res = await fetch(`${contentsUrl(path)}?ref=${encodeURIComponent(env.githubBranch)}`, {
    headers: headers(),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub getFile(${path}) failed: HTTP ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (Array.isArray(json)) {
    throw new Error(`GitHub getFile(${path}): path is a directory, not a file`);
  }
  return { sha: json.sha, contentBase64: json.content };
}

// Creates or updates a file with a direct commit to the configured branch.
// Pass `sha` (from getFile) when updating an existing file.
export async function putFile({ path, base64Content, message, sha }) {
  const body = {
    message,
    content: base64Content,
    branch: env.githubBranch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(contentsUrl(path), {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GitHub putFile(${path}) failed: HTTP ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return { commitSha: json.commit?.sha, contentSha: json.content?.sha };
}
