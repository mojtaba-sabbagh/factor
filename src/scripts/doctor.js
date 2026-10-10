#!/usr/bin/env node
"use strict";

/**
 * One-shot health check for a deployed app, for the class of problem where the
 * server answers but nothing works: the login form submits and the page goes
 * blank, or the shell reports `Environment variable not found: DATABASE_URL`.
 *
 * It reports what the *running* process sees, because that is exactly what is
 * missing when the cPanel UI holds the values but Passenger never received them,
 * or the app was never restarted after they were added. Read-only: it writes no
 * file and changes no table.
 *
 * Usage (from the application root, inside the virtualenv):
 *   npm run doctor
 *   DATABASE_URL="postgresql://..." npm run doctor   # an inline value wins
 */

const fs = require("node:fs");
const path = require("node:path");

// Fills process.env from the application root's .env / .env.local first — what the
// Next server does at boot — so the report reflects the deployed configuration.
// Neither file exists on the server unless you created it.
const { files } = require("./load-env");

const ROOT = path.resolve(__dirname, "..", "..");

let problems = 0;

function ok(label, detail) {
  console.log(`  ok    ${label}${detail ? ` — ${detail}` : ""}`);
}

function info(label, detail) {
  console.log(`  --    ${label}${detail ? ` — ${detail}` : ""}`);
}

function bad(label, detail, hint) {
  problems += 1;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  if (hint) console.log(`        ${hint}`);
}

// Prisma's error codes, reduced to the ones a deployment actually produces.
const DB_HINTS = {
  P1000: "wrong user or password in DATABASE_URL",
  P1001: "the host/port in DATABASE_URL is not reachable — is PostgreSQL running?",
  P1002: "the connection timed out — check the host/port in DATABASE_URL",
  P1003: "the database name in DATABASE_URL does not exist",
  P2010: "raw query failed — has `npm run db:deploy` been run?",
  P2021: "the table does not exist — run `npm run db:deploy`",
  P2022: "a column is missing — run `npm run db:deploy`",
};

const errorCode = (err) => (err && typeof err === "object" && "code" in err ? String(err.code) : "");
const errText = (err) => String(err instanceof Error ? err.message : err);

// The interesting part of a Prisma error: "Can't reach database server",
// "Authentication failed", "relation ... does not exist". Prisma 5's connection
// failures (PrismaClientInitializationError) carry no `code` at all, so the text is
// the only thing to go on. The message also begins with a blank line and an
// "Invalid `...` invocation" block, so the first line is usually empty.
const EXPLAINS = /can't reach|authentication failed|does not exist|denied|timed out|refused/i;

function firstLine(err) {
  const lines = errText(err)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => EXPLAINS.test(line)) ?? lines.find((line) => !line.startsWith("Invalid `")) ?? lines[0] ?? "";
}

function errorHint(err) {
  const text = errText(err);
  if (/can't reach|refused|timed out/i.test(text)) {
    return "the host/port in DATABASE_URL is not reachable from this account — is PostgreSQL running?";
  }
  if (/authentication failed/i.test(text)) return "wrong user or password in DATABASE_URL";
  if (/does not exist on the database server/i.test(text)) return "the database name in DATABASE_URL does not exist";
  if (/does not exist in the current database/i.test(text)) return "the tables do not exist — run `npm run db:deploy`";
  return (
    DB_HINTS[errorCode(err)] ?? "see the app log (stderr.log in the application root) for the full trace"
  );
}

/** `postgresql://***@host:port/db?schema=public` — never prints the password. */
function describeDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username ? "***@" : ""}${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return "not a valid URL";
  }
}

function reportRuntime() {
  console.log("[doctor] runtime");
  info("node", `${process.version} (${process.platform} ${process.arch})`);
  info("app root", ROOT);
  info("working directory", process.cwd());
  info("NODE_ENV", process.env.NODE_ENV || "(not set)");
}

function reportEnvironment() {
  console.log("");
  console.log("[doctor] environment files (read in this order; an exported value wins over both)");
  if (files.length === 0) {
    info("none found", "no .env and no .env.local in the application root");
  } else {
    for (const file of files) ok(path.relative(ROOT, file), `${fs.statSync(file).size} bytes`);
  }

  console.log("");
  console.log("[doctor] variables the app needs");
  if (process.env.DATABASE_URL) {
    ok("DATABASE_URL", describeDatabaseUrl(process.env.DATABASE_URL));
  } else {
    bad(
      "DATABASE_URL",
      "not set",
      'create .env in the application root (DEPLOYMENT.md section 5), or pass it inline: DATABASE_URL="postgresql://..." npm run doctor',
    );
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    bad("SESSION_SECRET", "not set", "generate one with `openssl rand -hex 32` and put it in .env");
  } else if (secret.length < 32) {
    bad(
      "SESSION_SECRET",
      `${secret.length} characters`,
      "use at least 32 random characters: `openssl rand -hex 32`",
    );
  } else {
    ok("SESSION_SECRET", `${secret.length} characters`);
  }

  info("APP_URL", process.env.APP_URL || "(not set — password-recovery links in the log will be unusable)");
  reportCookiePolicy();
}

// A Secure cookie that arrives over plain HTTP is dropped by the browser without
// a word: the sign-in succeeds, redirects to "/", and the guard sends the visitor
// straight back to /login. Nothing in the response says why, so this pairing —
// not either value on its own — is what the check has to catch.
function reportCookiePolicy() {
  const override = process.env.SESSION_COOKIE_SECURE;
  const secure = override ? override === "true" : process.env.NODE_ENV === "production";
  const appUrl = process.env.APP_URL || "";

  if (!secure) {
    info(
      "SESSION_COOKIE_SECURE",
      "the session cookie is not Secure — workable on plain HTTP; set it back (or unset it) once the site has HTTPS",
    );
    return;
  }
  if (appUrl.startsWith("http://")) {
    bad(
      "SESSION_COOKIE_SECURE",
      `the session cookie is Secure, but APP_URL is ${appUrl}`,
      'browsers discard a Secure cookie sent over plain HTTP, so a correct sign-in bounces straight back to /login; serve the site over HTTPS, or set SESSION_COOKIE_SECURE="false" in the app-root .env and restart',
    );
    return;
  }
  info(
    "SESSION_COOKIE_SECURE",
    `the session cookie is Secure (${override ? "SESSION_COOKIE_SECURE" : "the production default"}) — correct for HTTPS; if the site is reachable over http:// too (missing or expired certificate), set SESSION_COOKIE_SECURE="false" and restart`,
  );
}

function reportBuild() {
  console.log("");
  console.log("[doctor] build artefacts (shipped in deploy.zip; `npm run build` produces them)");
  const required = [
    ["server.js", path.join(ROOT, "server.js")],
    [".next/BUILD_ID", path.join(ROOT, ".next", "BUILD_ID")],
    [".next/server", path.join(ROOT, ".next", "server")],
    [".next/static", path.join(ROOT, ".next", "static")],
    [".next/required-server-files.json", path.join(ROOT, ".next", "required-server-files.json")],
    ["public", path.join(ROOT, "public")],
  ];
  for (const [label, full] of required) {
    if (fs.existsSync(full)) {
      ok(label, label === ".next/BUILD_ID" ? fs.readFileSync(full, "utf8").trim() : "");
    } else {
      bad(label, "missing", "run `npm run deploy` locally and upload the new deploy.zip");
    }
  }
}

function reportPrismaClient() {
  console.log("");
  console.log("[doctor] Prisma client");
  const dir = path.join(ROOT, "node_modules", ".prisma", "client");
  const generated = path.join(dir, "index.js");
  if (!fs.existsSync(generated)) {
    bad(
      "generated client",
      "node_modules/.prisma/client/index.js is missing",
      "run `npm install` in the application root (its postinstall runs `prisma generate`)",
    );
    return;
  }
  ok("generated client", path.relative(ROOT, generated));

  const engines = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("query_engine") || name.startsWith("libquery_engine"));
  if (engines.length) {
    ok("query engines", engines.join(", "));
  } else {
    bad(
      "query engines",
      "no query_engine-* file next to the generated client",
      "the engine for this host is missing — see DEPLOYMENT.md, Appendix D, Path 2",
    );
  }
}

async function reportDatabase() {
  console.log("");
  console.log("[doctor] database");
  if (!process.env.DATABASE_URL) {
    info("skipped", "DATABASE_URL is not set (see above)");
    return;
  }

  let PrismaClient;
  try {
    ({ PrismaClient } = require("@prisma/client"));
  } catch (err) {
    bad("Prisma client", firstLine(err), "run `npm install` in the application root");
    return;
  }

  let db;
  try {
    db = new PrismaClient();
  } catch (err) {
    bad("Prisma client", firstLine(err));
    return;
  }

  try {
    const started = Date.now();
    await db.$queryRaw`select 1`;
    ok("connection", `select 1 in ${Date.now() - started} ms`);

    try {
      const rows = await db.$queryRaw`select count(*)::int as count from "_prisma_migrations"`;
      ok("migrations", `_prisma_migrations: ${rows && rows[0] ? rows[0].count : "?"} row(s)`);
    } catch {
      bad(
        "migrations",
        'the "_prisma_migrations" table is missing',
        "run `npm run db:deploy` in the application root",
      );
    }

    try {
      const users = await db.user.count();
      ok("tables", `"User" is readable (${users} account(s))`);
    } catch (err) {
      bad("tables", firstLine(err), "run `npm run db:deploy` in the application root");
    }
  } catch (err) {
    bad("connection", firstLine(err), errorHint(err));
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

async function main() {
  reportRuntime();
  reportEnvironment();
  reportBuild();
  reportPrismaClient();
  await reportDatabase();

  console.log("");
  if (problems) {
    console.log(`[doctor] ${problems} problem(s) found — fix the FAIL lines above, then: touch tmp/restart.txt`);
    process.exitCode = 1;
  } else {
    console.log("[doctor] no problems found: the app has everything it needs to serve pages and sign you in.");
  }
}

main();
