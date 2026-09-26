import { PrismaClient } from "@prisma/client";

// Next.js dev mode reloads modules on every request, which would otherwise open a
// new Postgres connection pool each time. Stash the client on globalThis so it
// survives hot reloads; in production a single instance per server process is fine.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
