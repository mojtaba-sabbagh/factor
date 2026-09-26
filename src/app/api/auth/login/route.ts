import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { verifyPassword } from "../../../../lib/password";
import { createSession } from "../../../../lib/session";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return NextResponse.json({ error: "ایمیل و رمز عبور الزامی است." }, { status: 400 });

  const user = await db.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "ایمیل یا رمز عبور نادرست است." }, { status: 401 });
  }
  await createSession(user.id); // sets the httpOnly cookie on the response
  return NextResponse.json({ ok: true });
}
