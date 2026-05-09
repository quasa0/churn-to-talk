import { NextResponse } from "next/server";
import { markSent } from "@/app/lib/db";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  await markSent(params.id);
  return NextResponse.json({ ok: true });
}
