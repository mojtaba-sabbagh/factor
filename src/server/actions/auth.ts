"use server";

import { redirect } from "next/navigation";
import { db } from "../../lib/db";
import { hashPassword, verifyPassword } from "../../lib/password";
import { clearSession, createRecoveryToken, createSession, verifyRecoveryToken } from "../../lib/session";
import { requireAuth } from "../../lib/guards";

export type ActionState = { error?: string } | undefined;

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "ایمیل و رمز عبور الزامی است." };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "ایمیل یا رمز عبور نادرست است." };
  }
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  clearSession();
  redirect("/login");
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  const password = String(formData.get("password") || "");
  if (password.length < 8) return { error: "رمز عبور باید حداقل ۸ کاراکتر باشد." };
  await db.user.update({ where: { id: auth.userId }, data: { passwordHash: await hashPassword(password) } });
  return { error: undefined };
}

// Supabase used to email a magic link for this. Wire up real email delivery (SMTP,
// Postmark, etc.) where the TODO is — for now the link is logged server-side.
export async function requestRecoveryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    const token = await createRecoveryToken(user.id);
    // TODO: send this by email instead of logging it.
    console.log(`[recover] ${process.env.APP_URL}/account?recovery_token=${token}`);
  }
  // Always report success so this can't be used to enumerate registered emails.
  return { error: undefined };
}

export async function resetPasswordWithTokenAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 8) return { error: "رمز عبور باید حداقل ۸ کاراکتر باشد." };
  const userId = await verifyRecoveryToken(token);
  if (!userId) return { error: "پیوند بازیابی نامعتبر یا منقضی شده است." };
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  await createSession(userId);
  redirect("/");
}
