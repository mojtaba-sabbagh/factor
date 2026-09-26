import { db } from "./db";
import { getSessionUserId } from "./session";

export type AuthContext = {
  userId: string;
  email: string;
  role: "user" | "superadmin";
  companyId: string | null;
  companyName: string | null;
  companyLogo: string | null;
};

// This is the application-level replacement for Supabase's row-level security:
// every server action / route handler that touches company data must call one of
// requireCompany()/requireSuperadmin() below and scope its query to the result.
export async function getAuthContext(): Promise<AuthContext | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const profile = await db.profile.findUnique({
    where: { userId },
    include: { company: true },
  });
  if (!profile) return null;
  if (profile.companyId && profile.company && !profile.company.active) return null;
  const companySettings = profile.company?.settings as Record<string, unknown> | undefined;
  return {
    userId,
    email: profile.email,
    role: profile.role,
    companyId: profile.companyId,
    companyName: profile.company?.name ?? null,
    companyLogo: typeof companySettings?.logo === "string" ? companySettings.logo : null,
  };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuthContext();
  if (!auth) throw new AuthError("لطفاً وارد شوید.", 401);
  return auth;
}

export async function requireCompany(): Promise<AuthContext & { companyId: string }> {
  const auth = await requireAuth();
  if (!auth.companyId) throw new AuthError("حساب شما به هیچ شرکتی متصل نیست.", 403);
  return auth as AuthContext & { companyId: string };
}

export async function requireSuperadmin(): Promise<AuthContext> {
  const auth = await requireAuth();
  if (auth.role !== "superadmin") throw new AuthError("دسترسی غیرمجاز.", 403);
  return auth;
}
