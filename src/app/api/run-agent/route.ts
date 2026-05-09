import { NextResponse } from "next/server";

export async function POST() {
  const agentUrl = process.env.TENSORLAKE_AGENT_URL;
  const apiKey = process.env.TENSORLAKE_API_KEY;

  if (!agentUrl || !apiKey) {
    return NextResponse.json(
      { error: "Missing TENSORLAKE_AGENT_URL or TENSORLAKE_API_KEY" },
      { status: 500 }
    );
  }

  const response = await fetch(agentUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ source: "vercel-ui" }),
    cache: "no-store"
  });

  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    // Tensorlake may return an empty or plain-text response on errors.
  }

  if (!response.ok) {
    return NextResponse.json({ error: "Tensorlake trigger failed", details: payload }, { status: 502 });
  }

  return NextResponse.json({ ok: true, tensorlake: payload });
}
