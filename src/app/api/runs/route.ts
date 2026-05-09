import { NextResponse } from "next/server";
import { listRunHistory } from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await listRunHistory();
  return NextResponse.json({ runs });
}
