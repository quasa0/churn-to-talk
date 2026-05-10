import { spawnSync } from "node:child_process";
import { loadDotEnv } from "./env";

loadDotEnv();

const required = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "TENSORLAKE_AGENT_URL",
  "TENSORLAKE_API_KEY",
  "APP_BASE_URL",
  "HYPERSPELL_API_KEY",
  "HYPERSPELL_USER_ID",
  "HYPERSPELL_COLLECTION",
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

const envArgs = required.flatMap((key) => ["--env", `${key}=${process.env[key]}`]);
const buildEnvArgs = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"].flatMap((key) => [
  "--build-env",
  `${key}=${process.env[key]}`
]);

const result = spawnSync("vercel", ["deploy", "--prod", "--yes", ...envArgs, ...buildEnvArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

if (result.status !== 0) {
  throw new Error(`vercel deploy failed with exit code ${result.status}`);
}
