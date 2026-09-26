// Usage: node scripts/create-superadmin.js you@example.com "yourStrongPassword"
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

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
