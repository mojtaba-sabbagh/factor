import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { createRecoveryToken } from "../../../../lib/session";

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  const user = await db.user.findUnique({ where: { email: String(email || "").trim().toLowerCase() } });
  if (user) {
    const token = await createRecoveryToken(user.id);
    // TODO: send this by email instead of logging it.
    console.log(`[recover] ${process.env.APP_URL}/account?recovery_token=${token}`);
  }
  // Always 200, so this can't be used to enumerate registered emails.
  return NextResponse.json({ ok: true });
}
