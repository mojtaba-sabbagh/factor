#!/usr/bin/env node
"use strict";

/**
 * Packs the already-generated Prisma Client plus the Linux query engines into
 * `prisma-offline-client.tgz`.
 *
 * `npx prisma generate` downloads its engines from https://binaries.prisma.sh,
 * so it cannot run on a host without access to that domain. This script moves
 * the step to the development machine: generate locally (the Linux targets are
 * listed in prisma/schema.prisma), pack, upload, extract on the server.
 *
 * See DEPLOYMENT.md, Appendix D.
 *
 * Usage:
 *   npx prisma generate
 *   npm run prisma:offline-bundle                              # all Linux engines
 *   npm run prisma:offline-bundle -- --target debian-openssl-3.0.x
 *   npm run prisma:offline-bundle -- --out D:\tmp\client.tgz --all
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const CLIENT_DIR = path.join(ROOT, "node_modules", ".prisma", "client");
const DEFAULT_OUT = "prisma-offline-client.tgz";

// Everything Prisma Client needs at runtime. These two folders live inside
// node_modules, so extracting the tarball in the application root on the server
// puts them back where Node looks for them.
//   node_modules/.prisma/client  -> generated client + query engine binaries
//   node_modules/@prisma/client  -> loader/runtime (no dependencies of its own)
const PACKED_PATHS = [
  "node_modules/.prisma/client",
  "node_modules/@prisma/client",
];

const ENGINE_FILE = /^(libquery_engine|query_engine)-.+\.node$/;
const LINUX_ENGINE = /^libquery_engine-(.+)\.so\.node$/;

const HELP = `
Packs the generated Prisma Client for a server that cannot reach
binaries.prisma.sh, so that "prisma generate" never has to run there.

Usage:
  npm run prisma:offline-bundle [-- options]

Options:
  --out <file>      where to write the tarball (default: ${DEFAULT_OUT})
  --target <name>   keep a single Linux engine, e.g. debian-openssl-3.0.x.
                    Find the name the host needs with:
                      node -e "require('@prisma/get-platform') \\
                        .getBinaryTargetForCurrentPlatform().then(console.log)"
                    Default: every Linux engine that was generated.
  --all             keep the engines for every platform, including this machine.
  -h, --help        show this message

The tarball is extracted in the application root on the server:
  tar -xzf ${DEFAULT_OUT}
`;

function fail(message) {
  console.error(`\n  x ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { out: DEFAULT_OUT, target: "", all: false, help: false };
  const readValue = (index, name) => {
    const value = argv[index];
    if (!value || value.startsWith("--")) {
      fail(`Option ${name} needs a value.${HELP}`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.split("=");
    if (flag === "--help" || flag === "-h") options.help = true;
    else if (flag === "--all") options.all = true;
    else if (flag === "--out") {
      options.out = inline !== undefined ? inline : readValue(++i, "--out");
    } else if (flag === "--target") {
      options.target =
        inline !== undefined ? inline : readValue(++i, "--target");
    } else {
      fail(`Unknown option "${arg}".${HELP}`);
    }
  }
  return options;
}

function humanSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function listEngines(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => ENGINE_FILE.test(name))
    .map((name) => ({ name, size: fs.statSync(path.join(dir, name)).size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function selectEngines(options, engines, linuxEngines) {
  if (options.all) return new Set(engines.map((engine) => engine.name));

  if (!options.target) {
    return new Set(linuxEngines.map((engine) => engine.name));
  }

  const wanted = `libquery_engine-${options.target}.so.node`;
  if (!linuxEngines.some((engine) => engine.name === wanted)) {
    const available = linuxEngines
      .map((engine) => engine.name.replace(LINUX_ENGINE, "$1"))
      .map((name) => `    ${name}`)
      .join("\n");
    fail(`No engine "${wanted}" was generated. Available Linux engines:\n${available}`);
  }
  return new Set([wanted]);
}

function stageTree(stage, keepNames) {
  for (const relative of PACKED_PATHS) {
    const parts = relative.split("/");
    const source = path.join(ROOT, ...parts);
    if (!fs.existsSync(source)) {
      fail(`Missing ${relative}. Run \`npm install\` first.`);
    }
    fs.cpSync(source, path.join(stage, ...parts), {
      recursive: true,
      filter: (from) => {
        if (!fs.statSync(from).isFile()) return true;
        const name = path.basename(from);
        return !ENGINE_FILE.test(name) || keepNames.has(name);
      },
    });
  }
}

function report(outPath, kept, dropped) {
  const size = fs.statSync(outPath).size;
  const name = path.relative(ROOT, outPath) || outPath;
  console.log(`\n  + ${name} (${humanSize(size)})`);
  console.log("\n  Engines inside:");
  for (const engine of kept) {
    console.log(`    - ${engine.name} (${humanSize(engine.size)})`);
  }
  console.log("\n  Left out:");
  if (dropped.length === 0) console.log("    - nothing");
  for (const engine of dropped) console.log(`    - ${engine.name}`);
  console.log(
    "\n  On the server, in the application root:\n" +
      "    npm install --ignore-scripts --include=dev\n" +
      `    tar -xzf ${path.basename(outPath)}\n` +
      "    npm run build\n" +
      "\n  Do not run `npx prisma generate` there: the client above is the\n" +
      "  generated one, and it already contains the Linux engine.\n",
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const generated = ["index.js", "schema.prisma"].every((file) =>
    fs.existsSync(path.join(CLIENT_DIR, file)),
  );
  if (!generated) {
    fail(
      "No generated Prisma Client found in node_modules/.prisma/client.\n" +
        "  Run `npx prisma generate` on this machine first.",
    );
  }

  const engines = listEngines(CLIENT_DIR);
  const linuxEngines = engines.filter((engine) => LINUX_ENGINE.test(engine.name));
  if (linuxEngines.length === 0) {
    fail(
      "The generated client only contains an engine for this machine.\n" +
        "  Add the Linux targets to the generator block in prisma/schema.prisma,\n" +
        '  e.g. binaryTargets = ["native", "debian-openssl-3.0.x"],\n' +
        "  then run `npx prisma generate` again.",
    );
  }

  const keepNames = selectEngines(options, engines, linuxEngines);
  const kept = engines.filter((engine) => keepNames.has(engine.name));
  const dropped = engines.filter((engine) => !keepNames.has(engine.name));

  // Stage a clean tree, so that the tarball contains only what is needed.
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-offline-"));
  try {
    stageTree(stage, keepNames);

    const outPath = path.resolve(ROOT, options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const tar = spawnSync("tar", ["-czf", outPath, "-C", stage, "node_modules"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (tar.error) {
      fail(
        "Could not run `tar`. On Windows it ships with Windows 10 1803+; " +
          "otherwise pack the staging folder by hand:\n" +
          `  ${stage}`,
      );
    }
    if (tar.status !== 0) fail("`tar` failed; see the output above.");

    report(outPath, kept, dropped);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

main();
