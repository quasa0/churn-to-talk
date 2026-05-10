import { spawnSync } from "node:child_process";
import { loadDotEnv } from "./env";

loadDotEnv();

const required = [
  "OPENAI_API_KEY",
  "NIA_API_KEY",
  "INSFORGE_DATABASE_URL",
  "SKIP_NIA",
  "LOOPS_API_KEY",
  "LOOPS_TRANSACTIONAL_ID",
  "LOOPS_NOTIFY_EMAIL",
  "APP_BASE_URL"
];
const missing = required.filter((key) => !process.env[key]);

if (!process.env.TENSORLAKE_API_KEY) {
  missing.push("TENSORLAKE_API_KEY");
}

if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

const secretArgs = required.map((key) => `${key}=${process.env[key]}`);
const result = spawnSync("uv", ["run", "--with", "tensorlake", "tl", "secrets", "set", ...secretArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

if (result.status !== 0) {
  throw new Error(`tl secrets set failed with exit code ${result.status}`);
}
