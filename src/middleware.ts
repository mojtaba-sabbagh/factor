import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "factor_session";

// Paths reachable without a session: the login form, the account page (also used
// for the password-recovery landing, which carries its own one-time token instead
// of a session), the auth API routes, and Next's own internals/static assets.
const PUBLIC_PATHS = ["/login", "/account", "/api/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  try {
    // Edge runtime can't reach Postgres/Prisma, so middleware only confirms the
    // cookie is a validly signed, unexpired session. Role and "company active"
    // checks happen server-side in the (dashboard)/(admin) layouts, which do have
    // full Prisma access.
    await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets).*)"],
};
