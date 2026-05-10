import { Pool, type QueryResultRow } from "pg";
import type { DetectedUser, RunHistoryItem } from "./types";

let pool: Pool | null = null;

export function getDb(): Pool {
  if (pool) return pool;

  const connectionString = process.env.INSFORGE_DATABASE_URL;

  if (!connectionString) {
    throw new Error("Missing INSFORGE_DATABASE_URL");
  }

  const connectionUrl = new URL(connectionString);
  const requiresSsl = connectionUrl.searchParams.get("sslmode") === "require";
  connectionUrl.searchParams.delete("sslmode");

  pool = new Pool({
    connectionString: connectionUrl.toString(),
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined
  });
  return pool;
}

async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getDb().query<T>(text, values);
}

export async function listDetectedUsers(): Promise<DetectedUser[]> {
  const result = await query(`
      SELECT id, email, name, detection_reason, event_timeline, activity_summary,
             draft_message, status, detected_at, run_id
      FROM detected_users
      ORDER BY detected_at::timestamptz DESC, id DESC
      LIMIT 100
    `);

  return result.rows.map((row) => ({
    id: String(row.id),
    email: row.email ? String(row.email) : null,
    name: row.name ? String(row.name) : null,
    detection_reason: row.detection_reason ? String(row.detection_reason) : null,
    event_timeline: row.event_timeline ? String(row.event_timeline) : null,
    activity_summary: row.activity_summary ? String(row.activity_summary) : null,
    draft_message: row.draft_message ? String(row.draft_message) : null,
    status: row.status ? String(row.status) : "pending",
    detected_at: row.detected_at ? String(row.detected_at) : null,
    run_id: row.run_id ? String(row.run_id) : null
  }));
}

export async function getDetectedUser(id: string): Promise<DetectedUser | null> {
  const result = await query(
    `
      SELECT id, email, name, detection_reason, event_timeline, activity_summary,
             draft_message, status, detected_at, run_id
      FROM detected_users
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    email: row.email ? String(row.email) : null,
    name: row.name ? String(row.name) : null,
    detection_reason: row.detection_reason ? String(row.detection_reason) : null,
    event_timeline: row.event_timeline ? String(row.event_timeline) : null,
    activity_summary: row.activity_summary ? String(row.activity_summary) : null,
    draft_message: row.draft_message ? String(row.draft_message) : null,
    status: row.status ? String(row.status) : "pending",
    detected_at: row.detected_at ? String(row.detected_at) : null,
    run_id: row.run_id ? String(row.run_id) : null
  };
}

export async function updateDraft(id: string, draftMessage: string): Promise<void> {
  await query("UPDATE detected_users SET draft_message = $1 WHERE id = $2", [draftMessage, id]);
}

export async function markSent(id: string): Promise<void> {
  await query("UPDATE detected_users SET status = 'sent' WHERE id = $1", [id]);
}

export async function createPendingRun(requestId: string, source = "vercel-ui"): Promise<RunHistoryItem> {
  const startedAt = new Date().toISOString();
  const item: RunHistoryItem = {
    key: `run-pending:${requestId}`,
    request_id: requestId,
    ran_at: startedAt,
    users_found: 0,
    status: "running",
    source
  };

  await query(
    `
      INSERT INTO app_cache (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP::text)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP::text
    `,
    [item.key, JSON.stringify(item)]
  );

  return item;
}

export async function completePendingRun(requestId: string, output: unknown): Promise<void> {
  const completedAt = new Date().toISOString();
  await query(
    `
      UPDATE app_cache
      SET value = $1, updated_at = CURRENT_TIMESTAMP::text
      WHERE key = $2
    `,
    [
      JSON.stringify({
        request_id: requestId,
        status: "complete",
        completed_at: completedAt,
        output
      }),
      `run-pending:${requestId}`
    ]
  );

  if (output && typeof output === "object" && !Array.isArray(output)) {
    const run = output as RunHistoryItem;
    if (run.ran_at) {
      await query(
        `
          INSERT INTO app_cache (key, value, updated_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP::text)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP::text
        `,
        [`run:${run.ran_at}`, JSON.stringify({ ...run, request_id: requestId })]
      );
    }
  }
}

export async function failPendingRun(requestId: string, error: string): Promise<void> {
  await query(
    `
      UPDATE app_cache
      SET value = $1, updated_at = CURRENT_TIMESTAMP::text
      WHERE key = $2
    `,
    [
      JSON.stringify({
        request_id: requestId,
        ran_at: new Date().toISOString(),
        users_found: 0,
        status: "failed",
        source: "vercel-ui",
        error
      }),
      `run-pending:${requestId}`
    ]
  );
}

export async function listRunHistory(): Promise<RunHistoryItem[]> {
  const result = await query(`
      SELECT key, value
      FROM app_cache
      WHERE key LIKE 'run:%' OR key LIKE 'run-pending:%'
      ORDER BY updated_at::timestamptz DESC, key DESC
      LIMIT 1000
    `);

  const parsedRows = result.rows.map((row) => {
    const key = String(row.key);
    try {
      const parsed = JSON.parse(String(row.value ?? "{}")) as Omit<RunHistoryItem, "key">;
      return { key, ...parsed };
    } catch {
      return { key, status: "unparseable" };
    }
  });

  return parsedRows.filter((run) => {
    if (!run.key.startsWith("run-pending:")) return true;
    return run.status !== "complete";
  });
}
