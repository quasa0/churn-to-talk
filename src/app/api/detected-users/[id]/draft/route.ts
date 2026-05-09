import { NextResponse } from "next/server";
import { z } from "zod";
import { updateDraft } from "@/app/lib/db";

const Body = z.object({
  draft_message: z.string().min(1)
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = Body.parse(await request.json());
  await updateDraft(params.id, body.draft_message);
  return NextResponse.json({ ok: true });
}
