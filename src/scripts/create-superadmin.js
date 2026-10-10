// Usage: node scripts/create-superadmin.js you@example.com "yourStrongPassword"
//
// load-env first: it reads the application root's .env / .env.local, which is
// where cPanel deployments keep DATABASE_URL (Prisma looks next to its own
// generated client, i.e. inside the virtualenv — see src/scripts/load-env.js).
const { requireDatabaseUrl } = require("./load-env");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

requireDatabaseUrl(
  'DATABASE_URL="postgresql://..." npm run create:superadmin -- you@example.com "a-strong-password"'
);

const db = new PrismaClient();

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: node scripts/create-superadmin.js you@example.com "yourStrongPassword"');
    process.exit(1);
  }
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.upsert({
    where: { email: normalizedEmail },
    update: { passwordHash },
    create: { email: normalizedEmail, passwordHash },
  });

  await db.profile.upsert({
    where: { userId: user.id },
    update: { role: "superadmin", email: normalizedEmail },
    create: { userId: user.id, email: normalizedEmail, role: "superadmin", companyId: null },
  });

  console.log(`Superadmin ready: ${normalizedEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
