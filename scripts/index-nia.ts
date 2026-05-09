import { loadDotEnv } from "./env";

loadDotEnv();

const apiKey = process.env.NIA_API_KEY;
const repoUrl = process.env.FASTCLIP_REPO_URL;
const repository =
  process.env.NIA_REPOSITORY ??
  repoUrl?.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");

if (!apiKey) throw new Error("Missing NIA_API_KEY");
if (!repoUrl) throw new Error("Missing FASTCLIP_REPO_URL, for example https://github.com/org/fastclip");
if (!repository) throw new Error("Missing NIA_REPOSITORY, for example org/repo");

const response = await fetch("https://apigcp.trynia.ai/v2/sources", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    type: "repository",
    repository,
    url: repoUrl,
    branch: "main"
  })
});

const text = await response.text();
if (!response.ok) {
  throw new Error(`Nia indexing failed (${response.status}): ${text}`);
}

console.log(text);
