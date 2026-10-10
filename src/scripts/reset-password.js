// Usage: node scripts/reset-password.js someone@example.com "newPassword"
// Unlike create-superadmin.js, this never touches role or companyId — it only
// resets the password for an existing user, whatever kind of account they have.
//
// load-env first: it reads the application root's .env / .env.local, which is
// where cPanel deployments keep DATABASE_URL (Prisma looks next to its own
// generated client, i.e. inside the virtualenv — see src/scripts/load-env.js).
const { requireDatabaseUrl } = require("./load-env");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

requireDatabaseUrl(
  'DATABASE_URL="postgresql://..." npm run reset:password -- someone@example.com "a-new-password"'
);

const db = new PrismaClient();

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: node scripts/reset-password.js someone@example.com "newPassword"');
    process.exit(1);
  }
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    console.error(`No user found with email ${normalizedEmail}`);
    process.exit(1);
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  console.log(`Password reset for ${normalizedEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
