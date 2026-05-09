import type { DetectedUser } from "./types";

type HyperspellMemoryStatus = {
  source: string;
  resource_id: string;
  status: string;
};

export function isHyperspellConfigured() {
  return Boolean(process.env.HYPERSPELL_API_KEY && process.env.HYPERSPELL_USER_ID);
}

export function hyperspellUserResourceId(userId: string) {
  return `churn-to-talk:user:${userId}`;
}

export async function addDetectedUserToHyperspell(user: DetectedUser): Promise<HyperspellMemoryStatus> {
  const apiKey = process.env.HYPERSPELL_API_KEY;
  const userId = process.env.HYPERSPELL_USER_ID;

  if (!apiKey || !userId) {
    throw new Error("Missing HYPERSPELL_API_KEY or HYPERSPELL_USER_ID");
  }

  const appBaseUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "").replace(/\/$/, "");
  const userUrl = appBaseUrl ? `${appBaseUrl}/users/${encodeURIComponent(user.id)}` : `/users/${encodeURIComponent(user.id)}`;
  const resourceId = hyperspellUserResourceId(user.id);
  const title = `Churn signal: ${user.name || user.email || user.id}`;

  const response = await fetch("https://api.hyperspell.com/memories/add", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-As-User": userId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resource_id: resourceId,
      collection: process.env.HYPERSPELL_COLLECTION || "churn-to-talk",
      title,
      date: user.detected_at || new Date().toISOString(),
      text: renderDetectedUserMemory(user, userUrl),
      metadata: {
        app: "churn-to-talk",
        user_id: user.id,
        user_email: user.email || "",
        user_name: user.name || "",
        run_id: user.run_id || "",
        status: user.status || "",
        detected_at: user.detected_at || "",
        link: userUrl,
        churn_reason: user.detection_reason || "",
      },
    }),
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    // Preserve the raw body for debugging if Hyperspell returns plain text.
  }

  if (!response.ok) {
    throw new Error(`Hyperspell add memory failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload as HyperspellMemoryStatus;
}

function renderDetectedUserMemory(user: DetectedUser, userUrl: string) {
  return [
    `Churn-to-Talk detected user: ${user.name || "Unknown"} <${user.email || "no email"}>`,
    `Link: ${userUrl}`,
    `Status: ${user.status}`,
    `Detected at: ${user.detected_at || "unknown"}`,
    `Run id: ${user.run_id || "unknown"}`,
    "",
    "Why churned:",
    user.detection_reason || "No churn reason recorded.",
    "",
    "Activity summary:",
    user.activity_summary || "No activity summary recorded.",
    "",
    "Raw event timeline:",
    eventTimelineText(user.event_timeline),
    "",
    "Founder recovery draft:",
    user.draft_message || "No draft recorded.",
  ].join("\n");
}

function eventTimelineText(value: string | null) {
  if (!value) return "No event timeline recorded.";
  try {
    const parsed = JSON.parse(value) as { events?: unknown };
    return typeof parsed.events === "string" ? parsed.events : JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}
