// Loads the application root's `.env` (then `.env.local`) for the scripts that
// are run from a shell — create-superadmin, reset-password.
//
// Prisma resolves `env("DATABASE_URL")` by itself, but it looks for its `.env`
// relative to the *generated client* (`.prisma/client/../../../.env`). On cPanel
// that client physically lives inside the Node.js virtualenv, because the app's
// `node_modules` is a symlink into it:
//
//   ~/nodevenv/<app>/<version>/lib/node_modules/.prisma/client/../../../.env
//   = ~/nodevenv/<app>/<version>/lib/.env
//
// So the `.env` in the application root that DEPLOYMENT.md section 5 tells you to
// create is invisible to Prisma in that layout, and the variables set in the
// cPanel UI (Setup Node.js App -> Environment variables) are injected into the
// Passenger process only — an SSH session never sees them. Reading the app root
// here removes both traps and makes `npm run create:superadmin` behave the same
// way it does on a development machine.
//
// Precedence matches Next.js (`.env.local` beats `.env`) and, as with dotenv, a
// variable that is already set wins over both — so
// `DATABASE_URL=... npm run create:superadmin -- ...` still overrides the file.
const fs = require("fs");
const path = require("path");

// In this order, so the more specific `.env.local` wins.
const FILE_NAMES = [".env", ".env.local"];

// `npm run` uses the package root as cwd; the second entry covers
// `node src/scripts/whatever.js` invoked from somewhere else.
const ROOTS = [...new Set([path.resolve(process.cwd()), path.resolve(__dirname, "..", "..")])];

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// The small subset of dotenv's syntax that .env.example uses: `KEY=value`,
// `KEY="value"`, `KEY='value'`, blank lines and `#` comments.
function parse(text) {
  const parsed = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!KEY_RE.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      const end = value.indexOf(quote, 1);
      value = end === -1 ? value.slice(1) : value.slice(1, end);
    } else {
      const comment = value.search(/\s#/);
      if (comment !== -1) value = value.slice(0, comment);
      value = value.trim();
    }
    parsed[key] = value;
  }
  return parsed;
}

function load() {
  const preset = new Set(Object.keys(process.env)); // never clobber the caller's env
  const loaded = [];
  for (const root of ROOTS) {
    for (const name of FILE_NAMES) {
      const file = path.join(root, name);
      if (!fs.existsSync(file)) continue;
      for (const [key, value] of Object.entries(parse(fs.readFileSync(file, "utf8")))) {
        if (!preset.has(key)) process.env[key] = value;
      }
      loaded.push(file);
    }
  }
  return loaded;
}

// Fails fast — with instructions instead of a Prisma stack trace ten lines
// deep — when DATABASE_URL is still missing after loading the files above.
function requireDatabaseUrl(command) {
  if (process.env.DATABASE_URL) return;
  const example =
    command ??
    'DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public" <command>';
  console.error(
    [
      "DATABASE_URL is not set, so this script cannot reach the database.",
      "",
      "Create .env in the application root (DEPLOYMENT.md section 5):",
      '  DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"',
      "",
      "or pass it for this one command:",
      `  ${example}`,
    ].join("\n")
  );
  process.exit(1);
}

module.exports = { load, files: load(), requireDatabaseUrl };
