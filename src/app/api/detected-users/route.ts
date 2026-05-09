import { NextResponse } from "next/server";
import { listDetectedUsers } from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const users = await listDetectedUsers();
  return NextResponse.json({ users });
}
