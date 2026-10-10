#!/usr/bin/env node
"use strict";

/**
 * Packages the standalone build into `deploy.zip` for cPanel.
 *
 * The archive is rooted at the application root on the server, so extracting it
 * there overwrites the existing files:
 *
 *   unzip -o deploy.zip && npm install && touch tmp/restart.txt
 *
 * Contents (see DEPLOYMENT.md):
 *   server.js              the Passenger entry point from the repo root
 *   package.json           dependency manifest (cPanel runs `npm install`)
 *   package-lock.json      pins next/prisma for the server's `npm install`
 *   .next/                 the standalone build, incl. the copied .next/static
 *   public/                the copied public assets
 *   prisma/                schema + migrations; the `postinstall` hook runs
 *                          `prisma generate`, and `npm run db:deploy` applies
 *                          prisma/migrations/
 *   src/scripts/create-superadmin.js  `npm run create:superadmin`
 *   src/scripts/reset-password.js     `npm run reset:password` — the shell-side
 *                          way to reset a forgotten admin password
 *   src/scripts/load-env.js           both account scripts read the app-root
 *                          .env / .env.local through this, because Prisma's own
 *                          lookup points inside the virtualenv
 *   src/scripts/doctor.js            `npm run doctor` — read-only check of the
 *                          environment, the build artefacts, the Prisma client
 *                          and the database; first thing to run when a page
 *                          comes up blank or a login does not go through
 *
 * Deliberately excluded:
 *   node_modules/  the host installs its own: cPanel/CloudLinux requires
 *                  node_modules to be a symlink into the virtualenv, and the
 *                  traced WSL/Windows binaries may not match the server's glibc
 *   .env, .env.*   the standalone folder carries a copy of the build-time .env;
 *                  shipping it would overwrite the production secrets
 *   server.js/package.json from .next/standalone (the repo-root ones win)
 *
 * The ZIP is written with `node:zlib` so the script needs neither the `zip`
 * binary (absent on Windows and often in WSL) nor WSL itself.
 *
 * Usage:
 *   npm run deploy:zip
 *   npm run deploy:zip -- --out D:\tmp\factor.zip
 */

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..", "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");
const DEFAULT_OUT = path.join(ROOT, "deploy.zip");

// Top-level entries inside .next/standalone that must not go into the archive.
const EXCLUDED_TOP_LEVEL = new Set([
  "node_modules", // installed on the server by cPanel
  "server.js", // the repo-root server.js is added instead
  "package.json", // the repo-root package.json is added instead
]);

// Never ship secrets: .next/standalone contains a copy of the build-time .env,
// and extracting it in the app root would overwrite the production .env.
const ENV_RE = /^\.env(\.|$)/;

/** Recursively lists `.next/standalone` as flat ZIP entries (dirs end in "/"). */
function collectEntries(dir, prefix, out) {
  for (const name of fs.readdirSync(dir)) {
    if (prefix === "" && (EXCLUDED_TOP_LEVEL.has(name) || ENV_RE.test(name))) continue;

    const full = path.join(dir, name);
    const entryName = prefix ? `${prefix}/${name}` : name;
    const stat = fs.statSync(full); // follows symlinks

    if (stat.isDirectory()) {
      out.push({ name: `${entryName}/`, dir: true, mtime: stat.mtime });
      collectEntries(full, entryName, out);
    } else if (stat.isFile()) {
      out.push({ name: entryName, file: full, mtime: stat.mtime });
    }
  }
}

// --- Minimal ZIP writer (store + deflate), no dependencies -------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time pair used by the ZIP headers. */
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff,
    time: ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff,
  };
}

/** Builds a complete ZIP archive buffer from the collected entries. */
function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  const push = (buf) => {
    chunks.push(buf);
    offset += buf.length;
  };

  const put = (target, value, size, at) => {
    if (size === 4) target.writeUInt32LE(value >>> 0, at);
    else target.writeUInt16LE(value & 0xffff, at);
  };

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const { date, time } = dosDateTime(entry.mtime);
    const raw = entry.dir ? Buffer.alloc(0) : fs.readFileSync(entry.file);
    const method = entry.dir ? 0 : 8; // 0 = store, 8 = deflate
    const body = entry.dir ? Buffer.alloc(0) : zlib.deflateRawSync(raw);
    const crc = entry.dir ? 0 : crc32(raw);
    const localOffset = offset;

    const local = Buffer.alloc(30);
    put(local, 0x04034b50, 4, 0); // local file header signature
    put(local, 20, 2, 4); // version needed
    put(local, 0x0800, 2, 6); // general purpose flag: UTF-8 names
    put(local, method, 2, 8);
    put(local, time, 2, 10);
    put(local, date, 2, 12);
    put(local, crc, 4, 14);
    put(local, body.length, 4, 18); // compressed size
    put(local, raw.length, 4, 22); // uncompressed size
    put(local, nameBuf.length, 2, 26);
    put(local, 0, 2, 28); // extra field length

    push(local);
    push(nameBuf);
    if (body.length) push(body);

    central.push({ entry, nameBuf, date, time, method, crc, csize: body.length, size: raw.length, localOffset });
  }

  const centralOffset = offset;
  for (const c of central) {
    const rec = Buffer.alloc(46);
    put(rec, 0x02014b50, 4, 0); // central directory header signature
    put(rec, 20, 2, 4); // version made by
    put(rec, 20, 2, 6); // version needed
    put(rec, 0x0800, 2, 8); // UTF-8 names
    put(rec, c.method, 2, 10);
    put(rec, c.time, 2, 12);
    put(rec, c.date, 2, 14);
    put(rec, c.crc, 4, 16);
    put(rec, c.csize, 4, 20);
    put(rec, c.size, 4, 24);
    put(rec, c.nameBuf.length, 2, 28);
    put(rec, 0, 2, 30); // extra field length
    put(rec, 0, 2, 32); // comment length
    put(rec, 0, 2, 34); // disk number start
    put(rec, 0, 2, 36); // internal attributes
    const mode = c.entry.dir ? 0o40755 : 0o100644;
    put(rec, (mode << 16) | (c.entry.dir ? 0x10 : 0), 4, 38); // external attributes
    put(rec, c.localOffset, 4, 42);

    push(rec);
    push(c.nameBuf);
  }
  const centralSize = offset - centralOffset;

  const eocd = Buffer.alloc(22);
  put(eocd, 0x06054b50, 4, 0); // end of central directory signature
  put(eocd, 0, 2, 4); // disk number
  put(eocd, 0, 2, 6); // disk with central directory
  put(eocd, central.length, 2, 8);
  put(eocd, central.length, 2, 10);
  put(eocd, centralSize, 4, 12);
  put(eocd, centralOffset, 4, 16);
  put(eocd, 0, 2, 20); // comment length
  push(eocd);

  return Buffer.concat(chunks);
}

// --- Main --------------------------------------------------------------------

function fail(message) {
  console.error(`[deploy:zip] ${message}`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out =
    outIndex !== -1 && args[outIndex + 1] ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;

  if (!fs.existsSync(STANDALONE)) {
    fail('.next/standalone is missing. Run `npm run build` (output: "standalone") first.');
  }
  if (
    !fs.existsSync(path.join(STANDALONE, "public")) ||
    !fs.existsSync(path.join(STANDALONE, ".next", "static"))
  ) {
    fail("public/ or .next/static is missing from .next/standalone. Re-run `npm run build` so postbuild (copy-static) runs.");
  }
  for (const required of ["server.js", "package.json", "package-lock.json"]) {
    if (!fs.existsSync(path.join(ROOT, required))) fail(`Missing required repo-root file: ${required}`);
  }
  if (!fs.existsSync(path.join(ROOT, "prisma", "schema.prisma"))) {
    fail("Missing prisma/schema.prisma — the server's `postinstall` runs `prisma generate`.");
  }

  const entries = [];
  // The two repo-root files replace the ones Next generated inside the bundle.
  for (const file of ["server.js", "package.json"]) {
    const full = path.join(ROOT, file);
    entries.push({ name: file, file: full, mtime: fs.statSync(full).mtime });
  }
  collectEntries(STANDALONE, "", entries);

  // Files a working server needs that the standalone bundle does not carry:
  // Prisma's schema + migrations (read by `prisma generate` during `npm
  // install` and by `prisma migrate deploy`), the lockfile that keeps those
  // installs on the exact versions the build was made with, and the helpers
  // behind `npm run create:superadmin` / `reset:password` / `doctor`.
  collectEntries(path.join(ROOT, "prisma"), "prisma", entries);
  for (const file of [
    "package-lock.json",
    "src/scripts/create-superadmin.js",
    "src/scripts/reset-password.js",
    "src/scripts/load-env.js",
    "src/scripts/doctor.js",
  ]) {
    const full = path.join(ROOT, file);
    entries.push({ name: file, file: full, mtime: fs.statSync(full).mtime });
  }

  const zip = buildZip(entries);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, zip);

  const files = entries.filter((e) => !e.dir).length;
  console.log(`[deploy:zip] wrote ${path.relative(ROOT, out)} (${(zip.length / 1024 / 1024).toFixed(1)} MB, ${files} files)`);
  console.log("[deploy:zip] included: .next/, public/, prisma/, server.js, package.json, package-lock.json, src/scripts/{create-superadmin,reset-password,load-env,doctor}.js");
  console.log("[deploy:zip] excluded: node_modules/, .env*");
  console.log("[deploy:zip] upload it to the app root on the server, then:");
  console.log("             unzip -o deploy.zip && npm install && touch tmp/restart.txt");
}

main();

