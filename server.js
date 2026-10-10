/**
 * cPanel (Phusion Passenger) startup file — the single entry point.
 *
 * On cPanel the app is served by Phusion Passenger, which hands the process a
 * listening socket through the PORT environment variable. That value is usually
 * a filesystem path such as /home/user/tmp/passenger-xxxx/socket rather than a
 * TCP port, and Passenger expects the application to start listening on it.
 * Next's own `next start` and its generated `output: "standalone"` server
 * cannot be used for that because they parse PORT with parseInt() and silently
 * fall back to TCP 3000, which Passenger never reaches (the classic
 * "503 Service Unavailable" after a successful npm install).
 *
 * This file starts Next's request handler on whatever Passenger provides and
 * still behaves like `next start` when PORT is a plain number, so the same
 * entry point also works on a VPS:
 *
 *     PORT=8080 node server.js
 *
 * In cPanel -> Setup Node.js App, set "Application startup file" to `server.js`.
 *
 * This file replaces the former `app.js`; see the bootstrap below for the one
 * thing a custom server must do differently when the app is built with
 * `output: "standalone"`.
 */
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

const path = require("path");

// ---------------------------------------------------------------------------
// Standalone-build bootstrap — MUST run before `require("next")`.
//
// `next({ dev: false })` below is a *custom* server, i.e. not the server Next
// generates for `output: "standalone"`. A custom server cannot read the build
// config out of a standalone bundle, for two reasons:
//
//   1. `.next/standalone/node_modules` is a *traced subset*. `loadConfig()`
//      calls `loadWebpackHook()`, which requires
//      `next/dist/compiled/webpack/bundle5`. Next traces that file for its own
//      generated server but not for ours, so the process dies on boot with
//      "Cannot find module './bundle5'".
//   2. `next.config.js` is not part of the bundle, so every runtime option in
//      it is silently ignored — most importantly
//      `experimental.serverActions.bodySizeLimit`, which would drop from the
//      configured 5 MB back to the 1 MB default and reject large logo uploads.
//
// Next's generated `server.js` works around this by exporting the resolved
// build config through `__NEXT_PRIVATE_STANDALONE_CONFIG`; `loadConfig()`
// returns it verbatim instead of reading next.config.js. Every standalone build
// writes the same object to `.next/required-server-files.json`, so we reuse
// that copy.
//
// `.env` is not affected: the Next server loads it from the application root
// itself (see base-server), not through loadConfig.
//
// When the file is absent — plain `next dev`, or a build-on-the-server layout
// where next.config.js sits next to this file — the require throws and Next
// falls back to loading next.config.js as usual.
try {
  const buildConfig = require(path.join(__dirname, ".next", "required-server-files.json")).config;
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(buildConfig);
} catch {
  // Not a standalone bundle: let Next load next.config.js.
}

const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3000;
// Never use process.env.HOSTNAME here: cPanel sets it to the server's own
// hostname, which is not a bindable address. TCP mode only ever needs 0.0.0.0.
const hostname = "0.0.0.0";

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => {
      // handle() rejects on malformed URLs / aborted requests. Swallow it so a
      // single bad request cannot take the whole Passenger process down.
      handle(req, res).catch((err) => {
        console.error("[server] request failed:", err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });
    });

    server.on("error", (err) => {
      console.error("[server] server error:", err);
      process.exit(1);
    });

    const isSocketPath = typeof port === "string" && Number.isNaN(Number(port));
    const onListening = () =>
      console.log(
        `[server] Next.js ready on ${isSocketPath ? `socket ${port}` : `${hostname}:${port}`}`,
      );

    if (isSocketPath) server.listen(port, onListening);
    else server.listen(Number(port), hostname, onListening);

    // Passenger sends SIGTERM when the app is restarted (tmp/restart.txt touch,
    // node_modules rebuild, or a graceful stop). Drain connections, then exit.
    const shutdown = (signal) => {
      console.log(`[server] received ${signal}, shutting down`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error("[server] failed to start Next.js:", err);
    if (err && err.message && err.message.includes("Could not find a production build")) {
      console.error("[server] Run `npm run build` in the application root first.");
    }
    process.exit(1);
  });
