import { spawnSync } from "node:child_process";
import { loadDotEnv } from "./env";

loadDotEnv();

const args = process.argv.slice(2);
if (args.length === 0) {
  throw new Error("Usage: tsx scripts/tl.ts <tl args...>");
}

if (!process.env.TENSORLAKE_API_KEY) {
  throw new Error("Missing TENSORLAKE_API_KEY");
}

const result = spawnSync("uv", ["run", "--with", "tensorlake", "tl", ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

if (result.status !== 0) {
  throw new Error(`tl ${args.join(" ")} failed with exit code ${result.status}`);
}
