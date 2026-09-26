import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";
import { requireSuperadmin, AuthError } from "../../../lib/guards";
import { hashPassword } from "../../../lib/password";

export async function POST(req: NextRequest) {
  try {
    await requireSuperadmin();
    const { action, ...payload } = await req.json().catch(() => ({}));

    switch (action) {
      case "list_companies": {
        const companies = await db.company.findMany({
          select: { id: true, name: true, active: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ companies });
      }
      case "create_company": {
        const { name, adminEmail, adminPassword } = payload;
        if (!name || !adminEmail || !adminPassword) {
          return NextResponse.json({ error: "نام شرکت، ایمیل و رمز عبور مدیر الزامی است." }, { status: 400 });
        }
        const result = await db.$transaction(async (tx) => {
          const company = await tx.company.create({ data: { name } });
          const user = await tx.user.create({
            data: { email: adminEmail.trim().toLowerCase(), passwordHash: await hashPassword(adminPassword) },
          });
          await tx.profile.create({
            data: { userId: user.id, email: adminEmail.trim().toLowerCase(), role: "user", companyId: company.id },
          });
          return { companyId: company.id, userId: user.id };
        });
        return NextResponse.json(result);
      }
      case "set_company_active": {
        const { companyId, active } = payload;
        await db.company.update({ where: { id: companyId }, data: { active: Boolean(active) } });
        return NextResponse.json({ ok: true });
      }
      case "invite_user": {
        const { companyId, email, password, role } = payload;
        const result = await db.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: { email: email.trim().toLowerCase(), passwordHash: await hashPassword(password) },
          });
          await tx.profile.create({
            data: {
              userId: user.id,
              email: email.trim().toLowerCase(),
              role: role === "superadmin" ? "superadmin" : "user",
              companyId: companyId || null,
            },
          });
          return { userId: user.id };
        });
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ error: `عملیات نامشخص: ${action}` }, { status: 400 });
    }
  } catch (err: unknown) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "این ایمیل قبلاً ثبت شده است." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "خطای سرور." }, { status: 500 });
  }
}
