import { NextResponse } from "next/server";
import { getDetectedUser } from "@/app/lib/db";
import { addDetectedUserToHyperspell, isHyperspellConfigured } from "@/app/lib/hyperspell";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  if (!isHyperspellConfigured()) {
    return NextResponse.json(
      { error: "Missing HYPERSPELL_API_KEY or HYPERSPELL_USER_ID" },
      { status: 500 }
    );
  }

  const user = await getDetectedUser(params.id);
  if (!user) {
    return NextResponse.json({ error: "Detected user not found" }, { status: 404 });
  }

  try {
    const memory = await addDetectedUserToHyperspell(user);
    return NextResponse.json({ ok: true, memory });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Hyperspell add memory failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
