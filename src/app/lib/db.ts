import { createClient, type Client } from "@libsql/client";
import type { DetectedUser, RunHistoryItem } from "./types";

let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
  }

  client = createClient({ url, authToken });
  return client;
}

export async function listDetectedUsers(): Promise<DetectedUser[]> {
  const result = await getDb().execute({
    sql: `
      SELECT id, email, name, detection_reason, event_timeline, activity_summary,
             draft_message, status, detected_at, run_id
      FROM detected_users
      ORDER BY datetime(detected_at) DESC, id DESC
      LIMIT 100
    `,
    args: []
  });

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
  const result = await getDb().execute({
    sql: `
      SELECT id, email, name, detection_reason, event_timeline, activity_summary,
             draft_message, status, detected_at, run_id
      FROM detected_users
      WHERE id = ?
      LIMIT 1
    `,
    args: [id]
  });

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
  await getDb().execute({
    sql: "UPDATE detected_users SET draft_message = ? WHERE id = ?",
    args: [draftMessage, id]
  });
}

export async function markSent(id: string): Promise<void> {
  await getDb().execute({
    sql: "UPDATE detected_users SET status = 'sent' WHERE id = ?",
    args: [id]
  });
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

  await getDb().execute({
    sql: `
      INSERT INTO app_cache (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `,
    args: [item.key, JSON.stringify(item)]
  });

  return item;
}

export async function completePendingRun(requestId: string, output: unknown): Promise<void> {
  const completedAt = new Date().toISOString();
  await getDb().execute({
    sql: `
      UPDATE app_cache
      SET value = ?, updated_at = datetime('now')
      WHERE key = ?
    `,
    args: [
      JSON.stringify({
        request_id: requestId,
        status: "complete",
        completed_at: completedAt,
        output
      }),
      `run-pending:${requestId}`
    ]
  });

  if (output && typeof output === "object" && !Array.isArray(output)) {
    const run = output as RunHistoryItem;
    if (run.ran_at) {
      await getDb().execute({
        sql: `
          INSERT INTO app_cache (key, value, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET
            value = json_set(app_cache.value, '$.request_id', ?),
            updated_at = datetime('now')
        `,
        args: [`run:${run.ran_at}`, JSON.stringify({ ...run, request_id: requestId }), requestId]
      });
    }
  }
}

export async function failPendingRun(requestId: string, error: string): Promise<void> {
  await getDb().execute({
    sql: `
      UPDATE app_cache
      SET value = ?, updated_at = datetime('now')
      WHERE key = ?
    `,
    args: [
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
  });
}

export async function listRunHistory(): Promise<RunHistoryItem[]> {
  const result = await getDb().execute({
    sql: `
      SELECT key, value
      FROM app_cache
      WHERE key LIKE 'run:%' OR key LIKE 'run-pending:%'
      ORDER BY datetime(updated_at) DESC, key DESC
      LIMIT 1000
    `,
    args: []
  });

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
