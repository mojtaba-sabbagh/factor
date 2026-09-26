import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/password";
import { requireAuth, AuthError } from "../../../../lib/guards";

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth();
    const { password } = await req.json().catch(() => ({}));
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "رمز عبور باید حداقل ۸ کاراکتر باشد." }, { status: 400 });
    }
    await db.user.update({ where: { id: auth.userId }, data: { passwordHash: await hashPassword(password) } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
