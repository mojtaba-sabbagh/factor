"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { requireSuperadmin } from "../../lib/guards";
import { hashPassword } from "../../lib/password";

export async function listCompaniesAction() {
  await requireSuperadmin();
  return db.company.findMany({
    select: { id: true, name: true, active: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export type AdminActionState = { error?: string; ok?: boolean } | undefined;

export async function createCompanyAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireSuperadmin();
  const name = String(formData.get("name") || "").trim();
  const adminEmail = String(formData.get("adminEmail") || "").trim().toLowerCase();
  const adminPassword = String(formData.get("adminPassword") || "");
  if (!name || !adminEmail || !adminPassword) return { error: "نام شرکت، ایمیل و رمز عبور مدیر الزامی است." };

  try {
    await db.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name } });
      const user = await tx.user.create({
        data: { email: adminEmail, passwordHash: await hashPassword(adminPassword) },
      });
      await tx.profile.create({
        data: { userId: user.id, email: adminEmail, role: "user", companyId: company.id },
      });
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return { error: "این ایمیل قبلاً ثبت شده است." };
    }
    throw err;
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function setCompanyActiveAction(companyId: string, active: boolean): Promise<void> {
  await requireSuperadmin();
  await db.company.update({ where: { id: companyId }, data: { active } });
  revalidatePath("/admin");
}

export async function inviteUserAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireSuperadmin();
  const companyId = String(formData.get("companyId") || "") || null;
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = formData.get("role") === "superadmin" ? "superadmin" : "user";
  if (!email || !password) return { error: "ایمیل و رمز عبور الزامی است." };

  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash: await hashPassword(password) } });
      await tx.profile.create({ data: { userId: user.id, email, role, companyId } });
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return { error: "این ایمیل قبلاً ثبت شده است." };
    }
    throw err;
  }
  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: true };
}
