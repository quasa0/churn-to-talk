import { Pool } from "pg";
import { loadDotEnv } from "./env";

loadDotEnv();

const connectionString = process.env.INSFORGE_DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing INSFORGE_DATABASE_URL");
}

const connectionUrl = new URL(connectionString);
const requiresSsl = connectionUrl.searchParams.get("sslmode") === "require";
connectionUrl.searchParams.delete("sslmode");

const db = new Pool({
  connectionString: connectionUrl.toString(),
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined
});

try {
  await db.query(`
      CREATE TABLE IF NOT EXISTS detected_users (
        id TEXT PRIMARY KEY,
        email TEXT,
        name TEXT,
        detection_reason TEXT,
        event_timeline TEXT,
        activity_summary TEXT,
        draft_message TEXT,
        status TEXT DEFAULT 'pending',
        detected_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
        run_id TEXT
      )
    `);

  await db.query(`
      CREATE TABLE IF NOT EXISTS app_cache (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
      )
    `);

  await db.query(
    `
        INSERT INTO app_cache (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP::text)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP::text
      `,
    [
      "setup:connection",
      JSON.stringify({
        ok: true,
        message: "InsForge Postgres connection verified from local setup script",
        checked_at: new Date().toISOString()
      })
    ]
  );

  await db.query(
    `
        INSERT INTO app_cache (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP::text)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP::text
      `,
    [
      "fastclip:context:fallback",
      JSON.stringify({
        summary:
          "fastclip.it helps creators turn long-form videos and podcasts into short-form clips, with upload/import, transcript-based clipping, AI clip suggestions, captions, editing, exports, and social-ready formats."
      })
    ]
  );

  const result = await db.query(
    "SELECT key, value, updated_at FROM app_cache WHERE key IN ('setup:connection', 'fastclip:context:fallback') ORDER BY key"
  );

  console.log(JSON.stringify({ rows: result.rows }, null, 2));
} finally {
  await db.end();
}
