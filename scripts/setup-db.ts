import { createClient } from "@libsql/client";
import { loadDotEnv } from "./env";

loadDotEnv();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
}

const db = createClient({ url, authToken });

await db.batch(
  [
    `
      CREATE TABLE IF NOT EXISTS detected_users (
        id TEXT PRIMARY KEY,
        email TEXT,
        name TEXT,
        detection_reason TEXT,
        event_timeline TEXT,
        activity_summary TEXT,
        draft_message TEXT,
        status TEXT DEFAULT 'pending',
        detected_at TEXT DEFAULT (datetime('now')),
        run_id TEXT
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS app_cache (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `,
    {
      sql: `
        INSERT INTO app_cache (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `,
      args: [
        "setup:connection",
        JSON.stringify({
          ok: true,
          message: "Turso connection verified from local setup script",
          checked_at: new Date().toISOString()
        })
      ]
    },
    {
      sql: `
        INSERT INTO app_cache (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `,
      args: [
        "fastclip:context:fallback",
        JSON.stringify({
          summary:
            "fastclip.it helps creators turn long-form videos and podcasts into short-form clips, with upload/import, transcript-based clipping, AI clip suggestions, captions, editing, exports, and social-ready formats."
        })
      ]
    }
  ],
  "write"
);

const result = await db.execute({
  sql: "SELECT key, value, updated_at FROM app_cache WHERE key IN ('setup:connection', 'fastclip:context:fallback') ORDER BY key",
  args: []
});

console.log(JSON.stringify({ rows: result.rows }, null, 2));
