/**
 * cPanel (Phusion Passenger) startup file.
 *
 * On cPanel the app is served by Phusion Passenger, which hands the process a
 * listening socket through the PORT environment variable. That value is usually
 * a filesystem path such as /home/user/tmp/passenger-xxxx/socket rather than a
 * TCP port, and Passenger expects the application to start listening on it.
 * Next's own `next start` / standalone server cannot be used for that because it
 * parses PORT with parseInt() and silently falls back to TCP 3000, which
 * Passenger never reaches (the classic "503 Service Unavailable" after a
 * successful npm install).
 *
 * This file starts Next's request handler on whatever Passenger provides and
 * still behaves like `next start` when PORT is a plain number, so the same
 * entry point also works on a VPS:
 *
 *     PORT=8080 node app.js
 *
 * In cPanel -> Setup Node.js App, set "Application startup file" to `app.js`.
 */
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

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
        console.error("[app] request failed:", err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });
    });

    server.on("error", (err) => {
      console.error("[app] server error:", err);
      process.exit(1);
    });

    const isSocketPath = typeof port === "string" && Number.isNaN(Number(port));
    const onListening = () =>
      console.log(
        `[app] Next.js ready on ${isSocketPath ? `socket ${port}` : `${hostname}:${port}`}`,
      );

    if (isSocketPath) server.listen(port, onListening);
    else server.listen(Number(port), hostname, onListening);

    // Passenger sends SIGTERM when the app is restarted (tmp/restart.txt touch,
    // node_modules rebuild, or a graceful stop). Drain connections, then exit.
    const shutdown = (signal) => {
      console.log(`[app] received ${signal}, shutting down`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error("[app] failed to start Next.js:", err);
    if (err && err.message && err.message.includes("Could not find a production build")) {
      console.error("[app] Run `npm run build` in the application root first.");
    }
    process.exit(1);
  });
