#!/usr/bin/env node
"use strict";

/**
 * Stages the public assets into the `output: "standalone"` build output.
 *
 * `next build` writes `.next/standalone/` (server.js + the traced node_modules)
 * but deliberately leaves out `public/` and `.next/static/`: the generated
 * server.js expects them to be served alongside, not copied inside. A release
 * that ships only `.next/standalone/` therefore renders without CSS/JS or
 * images until both folders are placed at:
 *
 *   .next/standalone/public/            <- contents of public/
 *   .next/standalone/.next/static/      <- contents of .next/static/
 *
 * This runs automatically as `postbuild` (see package.json) so both are in
 * place after every `npm run build`.
 *
 * It is written in Node rather than `mkdir -p && cp -r` because npm scripts run
 * through cmd.exe on Windows, where those POSIX commands do not exist. See
 * DEPLOYMENT.md.
 */

const { cpSync, existsSync, mkdirSync, readdirSync } = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");

// Destination paths inside the standalone output, and the build artefact each
// one is filled from. `cp -r public/* dest/` semantics: the *contents* of the
// source directory are copied, not the directory itself.
const TARGETS = [
  { from: path.join(ROOT, "public"), to: path.join(STANDALONE, "public") },
  {
    from: path.join(ROOT, ".next", "static"),
    to: path.join(STANDALONE, ".next", "static"),
  },
];

/** Copies every entry of `from` into `to`, creating `to` if needed. */
function copyContents(from, to) {
  if (!existsSync(from)) {
    console.warn(`[copy-static] skip: ${path.relative(ROOT, from)} does not exist`);
    return;
  }

  mkdirSync(to, { recursive: true });

  for (const entry of readdirSync(from)) {
    cpSync(path.join(from, entry), path.join(to, entry), { recursive: true });
    console.log(`[copy-static] ${path.relative(ROOT, from)}/${entry} -> ${path.relative(ROOT, to)}/${entry}`);
  }
}

if (!existsSync(STANDALONE)) {
  console.error(
    "[copy-static] .next/standalone is missing. Set `output: \"standalone\"` in next.config.js and run `npm run build` again.",
  );
  process.exit(1);
}

for (const { from, to } of TARGETS) copyContents(from, to);
