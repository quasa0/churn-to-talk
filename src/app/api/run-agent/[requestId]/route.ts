import { NextResponse } from "next/server";
import { completePendingRun, failPendingRun } from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { requestId: string } }
) {
  const apiKey = process.env.TENSORLAKE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing TENSORLAKE_API_KEY" },
      { status: 500 }
    );
  }

  const requestId = encodeURIComponent(params.requestId);
  const response = await fetch(
    `https://api.tensorlake.ai/applications/churn_recovery_agent/requests/${requestId}/output`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  const text = await response.text();
  if (!response.ok) {
    await failPendingRun(params.requestId, text.slice(0, 240));
    return NextResponse.json(
      { complete: false, error: "Tensorlake status failed", details: text },
      { status: 502 }
    );
  }

  if (!text.trim()) {
    return NextResponse.json({ complete: false });
  }

  try {
    const output = JSON.parse(text);
    await completePendingRun(params.requestId, output);
    return NextResponse.json({ complete: true, output });
  } catch {
    await completePendingRun(params.requestId, text);
    return NextResponse.json({ complete: true, output: text });
  }
}
