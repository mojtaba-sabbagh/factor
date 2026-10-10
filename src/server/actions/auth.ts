"use server";

import { redirect } from "next/navigation";
import { db } from "../../lib/db";
import { hashPassword, verifyPassword } from "../../lib/password";
import { clearSession, createRecoveryToken, createSession, verifyRecoveryToken } from "../../lib/session";
import { AuthError, requireAuth } from "../../lib/guards";

export type ActionState = { error?: string } | undefined;

// A Server Action that throws is answered with a 500, and with no error boundary
// above the form React unmounts the page: the browser shows an empty screen and
// nothing explains why. On a deployed app that is nearly always the environment —
// DATABASE_URL or SESSION_SECRET missing from the process (the cPanel UI values
// reach Passenger only; the app-root .env is what both the Next server and an SSH
// session read), a database that cannot be reached, or migrations that were never
// applied. Surface those on the form instead, and log the original error so the
// app log keeps the full trace.
function missingConfig(): string | null {
  const hint =
    "فایل .env را در ریشهٔ برنامه بسازید و برنامه را دوباره راهاندازی کنید (DEPLOYMENT.md بخش ۵)";
  if (!process.env.DATABASE_URL) return `DATABASE_URL روی سرور تنظیم نشده است: ${hint}.`;
  if (!process.env.SESSION_SECRET) return `SESSION_SECRET روی سرور تنظیم نشده است: ${hint}.`;
  return null;
}

// Prisma 5 raises connection failures as PrismaClientInitializationError, which
// carries no `code` at all — the reason only exists in the message
// ("Can't reach database server", "Authentication failed", ...). Fold those onto
// the codes the switch below already reports.
function inferCode(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (/can't reach database server|econnrefused|connection refused|timed out/i.test(message)) return "P1001";
  if (/authentication failed|credentials/i.test(message)) return "P1000";
  if (/does not exist on the database server/i.test(message)) return "P1003";
  if (/does not exist in the current database/i.test(message)) return "P2021";
  return "";
}

function serverFailure(where: string, err: unknown): string {
  console.error(`[auth] ${where} failed:`, err);
  if (err instanceof AuthError) return err.message;
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  switch (code || inferCode(err)) {
    case "P1000":
      return "دسترسی به پایگاه داده رد شد: نام کاربری یا رمز DATABASE_URL نادرست است.";
    case "P1001":
    case "P1002":
      return "سرور پایگاه داده در دسترس نیست. اجرای PostgreSQL و مقدار DATABASE_URL را بررسی کنید.";
    case "P1003":
      return "پایگاه دادهٔ خواستهشده وجود ندارد. نام پایگاه داده در DATABASE_URL را بررسی کنید.";
    case "P2010":
      return "پرس‌وجوی پایگاه داده اجرا نشد. احتمالاً جدول‌ها ساخته نشده‌اند: دستور npm run db:deploy را روی سرور اجرا کنید.";
    case "P2021":
    case "P2022":
      return "جدول‌های پایگاه داده ساخته نشده‌اند. دستور npm run db:deploy را روی سرور اجرا کنید.";
    default:
      return "خطای غیرمنتظره‌ای در سرور رخ داد. برای جزئیات، گزارش خطای برنامه را ببینید.";
  }
}

// createSession() throws when SESSION_SECRET is unset, which the form should be
// able to report too. redirect() is deliberately never inside a try block: it
// navigates by throwing NEXT_REDIRECT, so catching around it would swallow the
// navigation and leave the user on the form.
async function startSession(userId: string): Promise<string | null> {
  try {
    await createSession(userId);
    return null;
  } catch (err: unknown) {
    return serverFailure("createSession", err);
  }
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const config = missingConfig();
  if (config) return { error: config };

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "ایمیل و رمز عبور الزامی است." };

  let userId: string;
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return { error: "ایمیل یا رمز عبور نادرست است." };
    }
    userId = user.id;
  } catch (err: unknown) {
    return { error: serverFailure("login", err) };
  }

  const sessionError = await startSession(userId);
  if (sessionError) return { error: sessionError };
  redirect("/");
}

export async function logoutAction() {
  clearSession();
  redirect("/login");
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const config = missingConfig();
  if (config) return { error: config };

  const password = String(formData.get("password") || "");
  try {
    const auth = await requireAuth();
    if (password.length < 8) return { error: "رمز عبور باید حداقل ۸ کاراکتر باشد." };
    await db.user.update({ where: { id: auth.userId }, data: { passwordHash: await hashPassword(password) } });
  } catch (err: unknown) {
    return { error: serverFailure("changePassword", err) };
  }
  return { error: undefined };
}

// Supabase used to email a magic link for this. Wire up real email delivery (SMTP,
// Postmark, etc.) where the TODO is — for now the link is logged server-side.
export async function requestRecoveryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const config = missingConfig();
  if (config) return { error: config };

  const email = String(formData.get("email") || "").trim().toLowerCase();
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      const token = await createRecoveryToken(user.id);
      // TODO: send this by email instead of logging it.
      console.log(`[recover] ${process.env.APP_URL}/account?recovery_token=${token}`);
    }
  } catch (err: unknown) {
    // Still says nothing about whether the address exists.
    return { error: serverFailure("requestRecovery", err) };
  }
  // Always report success so this can't be used to enumerate registered emails.
  return { error: undefined };
}

export async function resetPasswordWithTokenAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const config = missingConfig();
  if (config) return { error: config };

  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  if (password.length < 8) return { error: "رمز عبور باید حداقل ۸ کاراکتر باشد." };

  let userId: string;
  try {
    const verified = await verifyRecoveryToken(token);
    if (!verified) return { error: "پیوند بازیابی نامعتبر یا منقضی شده است." };
    userId = verified;
    await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  } catch (err: unknown) {
    return { error: serverFailure("resetPassword", err) };
  }

  const sessionError = await startSession(userId);
  if (sessionError) return { error: sessionError };
  redirect("/");
}
