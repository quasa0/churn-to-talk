import { loadDotEnv } from "./env";

loadDotEnv();

const apiKey = process.env.TENSORLAKE_API_KEY;
const agentUrl =
  process.env.TENSORLAKE_AGENT_URL ?? "https://api.tensorlake.ai/applications/churn_recovery_agent";

if (!apiKey) throw new Error("Missing TENSORLAKE_API_KEY");

const response = await fetch(agentUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ source: "manual-script" })
});

const text = await response.text();
if (!response.ok) {
  throw new Error(`Agent trigger failed (${response.status}): ${text}`);
}

console.log(text);
