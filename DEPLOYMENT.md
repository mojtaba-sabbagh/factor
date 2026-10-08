# Deploying Factor on cPanel

This app is a Next.js 14 (App Router) application with Prisma + PostgreSQL. cPanel
runs Node.js apps through Phusion Passenger, so the deployment has three parts
that do not exist in a local setup:

1. Passenger needs a startup file — that is what `app.js` in the project root is
   for (`next start` cannot be used, see [Why `app.js`](#why-appjs-exists)).
2. The production build (`npm run build`) and the database migration
   (`prisma migrate deploy`) have to be run once on the server.
3. The environment variables from `.env.example` must be set on the server.

---

## 1. Requirements

| Requirement | Notes |
| --- | --- |
| cPanel with **Setup Node.js App** (Passenger) | Almost every cPanel host has it. If the icon is missing, ask support to enable "Node.js Selector", or use the [PM2 alternative](#appendix-b-pm2-instead-of-passenger). |
| Node.js **18.17 or newer** | Pick 18/20/22 in the Node.js Selector. Next.js 14 refuses to build on older versions. |
| A **PostgreSQL** database | See [step 2](#2-create-the-database). PostgreSQL, not MySQL — the schema uses enums and `JSONB`. |
| Terminal / SSH access | `npm install`, `prisma migrate deploy` and `npm run build` cannot be done through the File Manager. If your plan has no terminal, see [Appendix A](#appendix-a-no-terminal-access). |
| Access to `registry.npmjs.org` **and** `binaries.prisma.sh` | The engines Prisma needs are downloaded from `binaries.prisma.sh`, not from the npm registry. Hosts that block it need [Appendix D](#appendix-d--offline-install-no-access-to-binariesprismash). |
| An SSL certificate (AutoSSL is fine) | Session cookies are `Secure` in production. |

The repository also contains `deploy/cpanel/htaccess.example`, which is only
needed when Passenger is configured by hand.

## 2. Create the database

### Option A — PostgreSQL provided by cPanel

1. cPanel → **PostgreSQL Databases**.
2. Create a database, e.g. `factordb` → becomes `cpaneluser_factordb`.
3. Create a user with a long password.
4. Add the user to the database and tick **ALL PRIVILEGES**.

Connection string (used in step 5):

```text
postgresql://cpaneluser_factordbuser:PASSWORD@localhost:5432/cpaneluser_factordb?schema=public&connection_limit=5&pool_timeout=20
```

If the host has no PostgreSQL but does have MySQL, the schema must be ported
first — see [Appendix C](#appendix-c-mysql-instead-of-postgresql).

### Option B — managed PostgreSQL outside cPanel

If your host only offers MySQL, keep using an external Postgres (Neon,
Supabase, Railway, a small VPS...). No code change is needed, only a different
`DATABASE_URL`. Add `?sslmode=require` if the provider requires TLS, and make
sure `APP_URL` still points at the cPanel domain.

## 3. Create the Node.js application

cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
| --- | --- |
| Node.js version | 18, 20 or 22 (must be ≥ 18.17) |
| Application mode | **Production** |
| Application root | `factor` — keep it **outside** `public_html`, i.e. `/home/cpaneluser/factor` |
| Application URL | your domain, e.g. `example.com` (or `example.com/factor` for a sub-path) |
| Application startup file | `app.js` |

cPanel then creates the virtualenv (its path is shown in the app list, e.g.
`/home/cpaneluser/nodevenv/factor/20/bin/node`) and writes the Passenger
`mod_rewrite`/Passenger block into the document root.

> Keeping the app root outside `public_html` matters: Passenger serves any file
> that physically exists in the document root, so a codebase dropped into
> `public_html` would expose `/.env`, `/package.json` and
> `/prisma/migrations/*.sql` unless you add the hardening rules from
> `deploy/cpanel/htaccess.example`.

## 4. Upload the code

Either clone it (recommended, makes updates easy):

```bash
cd ~
source /home/cpaneluser/nodevenv/factor/20/bin/activate   # path from the app list
git clone <your-repo-url> factor
cd factor
```

…or upload a ZIP through the File Manager and extract it into
`/home/cpaneluser/factor`.

Never upload `node_modules` (Linux host, wrong binaries) or `.next`: they are
rebuilt in the next step. `.env` files are git-ignored and must be created in
step 5.

## 5. Configure the environment

Two ways, either is fine — the values set in the cPanel UI win over the `.env`
file, so mixing them is safe.

**cPanel UI:** Setup Node.js App → your app → **Environment variables**, add
`DATABASE_URL`, `SESSION_SECRET` and `APP_URL`.

**`.env` file in the application root** (`/home/cpaneluser/factor/.env`):

```bash
cd ~/factor
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # generate SESSION_SECRET
cat > .env <<'EOF'
DATABASE_URL="postgresql://cpaneluser_factordbuser:PASSWORD@localhost:5432/cpaneluser_factordb?schema=public&connection_limit=5&pool_timeout=20"
SESSION_SECRET="paste-the-generated-value-here"
APP_URL="https://example.com"
EOF
chmod 600 .env
```

Only add `SESSION_COOKIE_SECURE="false"` if the site is **not** on HTTPS yet —
otherwise login will bounce back to `/login` forever. See
[Troubleshooting](#troubleshooting).

## 6. Install dependencies and build

In cPanel → Terminal (or over SSH):

```bash
cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate

# The Node.js Selector installs with NODE_ENV=production, which skips
# devDependencies, but `next build` needs typescript and @types/*.
npm install --include=dev

npx prisma generate      # also runs automatically via postinstall
npm run build
```

A successful build ends with a route table (`○ /login`, `ƒ /`, ...) and writes
`.next/`. The `prisma postinstall` hook works even in production mode because
`prisma` is listed in `dependencies`, not `devDependencies`.

Both steps above download from the internet, and the engines do **not** come from
the npm registry: `npm install` runs Prisma's `postinstall` hooks, which fetch
them from `binaries.prisma.sh`, and `npx prisma generate` does the same. If the
host cannot reach that domain, use
[Appendix D](#appendix-d--offline-install-no-access-to-binariesprismash) instead
of these three commands.

## 7. Create the schema and the first superadmin

```bash
cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate

npx prisma migrate deploy     # or: npm run db:deploy
npx prisma migrate status     # or: npm run db:status  -> "Database schema is up to date!"

npm run create:superadmin -- you@example.com "a-strong-password"
```

`prisma migrate deploy` applies `prisma/migrations/*/migration.sql` in order and
is safe to re-run. Use `prisma migrate dev` only on a local database — it can
reset data.

It runs the `schema-engine` binary, which Prisma downloads on demand and caches
outside `node_modules`. On a host without access to `binaries.prisma.sh`, see
[Appendix D](#appendix-d--offline-install-no-access-to-binariesprismash) for the
two ways to apply the migration without it.

## 8. Start (or restart) the app and verify

```bash
cd ~/factor
mkdir -p tmp && touch tmp/restart.txt
```

Passenger restarts the application as soon as `tmp/restart.txt` is touched (this
folder and its `.gitkeep` are tracked in git). Newer cPanel versions also expose
a **Restart** button next to the app in Setup Node.js App.

Verification checklist:

1. `curl -I https://example.com/login` → `200 OK` and an `x-powered-by: Next.js`
   style response (not `503`).
2. Open `https://example.com/login`, sign in with the superadmin account. A
   successful login lands on the invoice list.
3. cPanel → Setup Node.js App shows the app as running; startup errors appear in
   the log file listed there (`~/logs/...` or `stderr.log` in the app root).

## Updating an existing deployment

```bash
cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate

git pull
npm install --include=dev
npx prisma migrate deploy     # only when prisma/migrations changed
npm run build
mkdir -p tmp && touch tmp/restart.txt
```

The build can be done while the old version is serving traffic; Passenger only
picks up the new build after the restart, so the downtime is one restart.

If `prisma/schema.prisma` changed **and** the host cannot reach
`binaries.prisma.sh`, re-create and re-upload the offline bundle
(`npx prisma generate && npm run prisma:offline-bundle`, then `tar -xzf` on the
server — see [Appendix D](#appendix-d--offline-install-no-access-to-binariesprismash)).
The bundle uploaded earlier contains the old client.

## Troubleshooting

### 503 Service Unavailable right after setup

Passenger could not start the process. Useful checks:

* Application startup file must be `app.js` (not `server.js`, not `index.js`).
* Run it by hand to see the real error:
  `cd ~/factor && source /home/cpaneluser/nodevenv/factor/20/bin/activate && node app.js`
  It must print `[app] Next.js ready on socket ...`.
* `[app] failed to start Next.js: Could not find a production build` → `npm run build` was not run.
* Add `PassengerFriendlyErrorPages on` to the document root `.htaccess`
  temporarily to see startup errors in the browser; remove it afterwards.

### 500 error on every request

Almost always Prisma. `npx prisma migrate status` plus this one-liner tell you
whether the database is reachable at all:

```bash
node -e "const {PrismaClient}=require('@prisma/client');new PrismaClient().\$queryRaw\`select 1\`.then(()=>console.log('db ok')).catch(e=>console.error(e.message))"
```

Common causes:

* Wrong credentials / database name in `DATABASE_URL` (cPanel prefixes both with
  the account name).
* The database user was not granted **ALL PRIVILEGES**.
* Wrong Prisma query engine for the host OS:
  `Query engine library for current platform "rhel-openssl-1.1.x" could not be found`.
  `prisma/schema.prisma` already lists the Linux targets, but after changing them
  you must re-run `npx prisma generate` on the server (or locally, then re-upload
  `node_modules/.prisma`).

### Prisma cannot download its engines (`binaries.prisma.sh`)

Symptoms during `npm install` or `npx prisma generate`:

```text
Error: Failed to fetch sha256 checksum at https://binaries.prisma.sh/all_commits/605197351a3c8bdd595af2d2a9bc3025bca48ea2/debian-openssl-3.0.x/libquery_engine.so.node.gz.sha256 - 403
request to https://binaries.prisma.sh/... failed, reason: connect ETIMEDOUT
```

The engines are not part of the npm package, they are downloaded from Prisma's
own host. Either point Prisma at a mirror or skip the download completely — both
are described in
[Appendix D](#appendix-d--offline-install-no-access-to-binariesprismash).

### Login redirects back to /login in a loop

The session cookie was dropped by the browser. This happens when the cookie is
`Secure` but the page is served over plain HTTP. Either enable AutoSSL
(recommended), or set `SESSION_COOKIE_SECURE="false"` while the certificate is
missing.

### `npm ERR!` / build fails on missing typescript

`npm install` was run in production mode. Re-run `npm install --include=dev`.

### "Cannot find module 'next/dist/...'" or 503 after a successful install

The virtualenv belongs to a different Node version than the one the app is
configured with. Re-select the Node version in Setup Node.js App and restart.

### Login works, but saving a form fails with "Invalid Server Actions request"

Next.js 14 rejects Server Action POSTs when the `Origin` header does not match the
`Host` header (`_next/server/app-render/action-handler`). On cPanel this shows up
when the site is visited through a host Apache does not forward verbatim, e.g. a
temporary/preview domain, a `www` ↔ non-`www` redirect chain, or a reverse proxy
that rewrites `Host`.

Fixes, in order of preference:

* Always visit the app through the canonical domain (the one you picked in
  Setup Node.js App) and let cPanel manage the redirect.
* In a proxy setup, forward the original host and scheme:
  `ProxyPreserveHost On`, `RequestHeader set X-Forwarded-Host ...`,
  `RequestHeader set X-Forwarded-Proto https`.
* Make sure `APP_URL` in `.env` matches that same canonical HTTPS origin.

### Changes are not visible

Forgot the restart: `touch ~/factor/tmp/restart.txt`. A rebuild alone does not
reload a running Passenger process.

### Password-recovery link

`/account` recovery links are printed to the server log for now
(`src/server/actions/auth.ts` and `src/app/api/auth/recover/route.ts` contain the
TODO); they use `APP_URL`, so set it to the public HTTPS URL or the link will be
unusable. Reading them requires the app log (see above).

## Why `app.js` exists

cPanel serves Node apps through Phusion Passenger. Passenger starts the process
and passes the listening socket in `PORT`, usually as a **filesystem path**
(`/home/user/tmp/passenger-xxxx/socket`) rather than a port number. Next's stock
`next start` and `output: "standalone"` servers both do
`parseInt(process.env.PORT, 10) || 3000`, so they would listen on TCP 3000 where
Passenger never looks, and the site would return 503 while the app looked healthy
in the log.

`app.js` avoids that by starting Next's own request handler
(`next({ dev: false })` + `getRequestHandler`) and listening on Passenger's
socket; if `PORT` is numeric it listens on `0.0.0.0:$PORT` instead, so
`npm run serve` also works on a plain VPS or inside a container. Because the
entry point is a custom server, `next.config.js` deliberately does **not** set
`output: "standalone"` — the full `node_modules` (including the Prisma engines)
is required on the server.

## Hardening checklist

* App root outside `public_html`, and `deploy/cpanel/htaccess.example` copied to
  the document root (or `PassengerAppRoot` configured by cPanel).
* `chmod 600 .env`.
* Remove `prisma:migrate` / `db:deploy` access from anyone who should not touch
  the database — it is only usable from the shell, not from the web UI.
* Fresh `SESSION_SECRET` on the server; never reuse the development value. Change
  it to invalidate every existing session.
* Rotate the superadmin password after the first login.
* Keep AutoSSL/Let's Encrypt enabled so session cookies stay `Secure`.

## Appendix A — no terminal access

Code changes (`git pull`, `npm install`, `npm run build`) require a shell. Some
hosts offer **cPanel → Terminal**, some only SSH, some neither; if neither is
available you have two options:

1. Ask support to enable Terminal/SSH for your account (most shared plans allow
   it on request).
2. Build the release locally and upload it: run `npm ci` and `npm run build` on a
   Linux machine (or WSL) with the same Node version, then upload everything
   including `.next` and `node_modules`. `prisma/schema.prisma` already lists the
   Linux engine targets, so the uploaded client works on the host. The migration
   still has to be applied once — via the host's PostgreSQL tooling
   (`psql`), or by running the SQL in
   `prisma/migrations/20260926014009_init/migration.sql` manually, then marking it
   applied with
   `npx prisma migrate resolve --applied 20260926014009_init`.

## Appendix B — PM2 instead of Passenger

On a VPS-style cPanel account (Terminal + PM2 available) you can skip the Node.js
Selector and run the built app as a plain process:

```bash
npm ci --include=dev && npm run build
PORT=3000 NODE_ENV=production pm2 start app.js --name factor
pm2 save
```

Then point the domain's document root at a small reverse proxy configuration, or
keep Passenger and use the setup described above — Passenger is the better fit on
managed cPanel hosting because it handles process supervision and the virtualenv.

## Appendix C — MySQL instead of PostgreSQL

The schema currently targets PostgreSQL: it uses real enums (`Role`, `DocType`),
`JSONB` columns for `settings`/`customer`/`items`/`invoice_counters`, and Prisma's
`Decimal(65,30)` for `extra_discount`/`tax_percent`. Moving to MySQL/MariaDB
requires changing `provider = "postgresql"` to `"mysql"`, deleting
`prisma/migrations/`, and regenerating the initial migration (`npx prisma migrate
dev`) — `db push` will not recreate the enum types MySQL maps differently. Do not
switch databases by editing the migration SQL by hand; regenerate it.

## Appendix D — offline install (no access to binaries.prisma.sh)

Deploying needs two downloads, from two different hosts:

| Step | Downloads from | What for |
| --- | --- | --- |
| `npm install` | `registry.npmjs.org`, **plus** `binaries.prisma.sh` (the `postinstall` hooks of `prisma`, `@prisma/client` and `@prisma/engines`) | the framework and the query engine |
| `npx prisma generate` | `binaries.prisma.sh` only | the generated client + the Linux query engine |
| `npx prisma migrate deploy` | `binaries.prisma.sh` (the `schema-engine`, cached on demand) | creating the tables |

So a host that reaches the npm registry but not `binaries.prisma.sh` fails on the
second and third row. Recognise it by the domain in the error:

```text
Error: Failed to fetch sha256 checksum at https://binaries.prisma.sh/all_commits/605197351a3c8bdd595af2d2a9bc3025bca48ea2/debian-openssl-3.0.x/libquery_engine.so.node.gz.sha256 - 403
request to https://binaries.prisma.sh/... failed, reason: connect ETIMEDOUT
```

The 40-character hash inside those URLs is the engine version pinned by
`@prisma/engines` and changes when Prisma is upgraded:

```bash
node -p "require('@prisma/engines-version').enginesVersion"
# 605197351a3c8bdd595af2d2a9bc3025bca48ea2
```

### Path 1 — point Prisma at a mirror (fastest)

Prisma builds the download URL from an environment variable, so any mirror with
the `binaries.prisma.sh` layout works. `registry.npmmirror.com` mirrors both the
npm registry and the Prisma engines, and is usually reachable from hosts that
cannot reach `prisma.io`/`npmjs.org`.

```bash
cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate

# Is the mirror reachable? (this URL is a ~100 byte checksum file)
curl -sI "https://registry.npmmirror.com/-/binary/prisma/all_commits/605197351a3c8bdd595af2d2a9bc3025bca48ea2/debian-openssl-3.0.x/schema-engine.gz.sha256" | head -1
# expect: HTTP/2 200

export PRISMA_ENGINES_MIRROR="https://registry.npmmirror.com/-/binary/prisma"
export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1   # only if the mirror has no .sha256 files

npm config set registry https://registry.npmmirror.com   # only if registry.npmjs.org is blocked too

rm -rf node_modules/.prisma ~/.cache/prisma   # drop half-downloaded engines
npm install --include=dev
npx prisma generate
```

* Both `export`s must be set **before** `npm install`: its `postinstall` hooks are
  the steps that download the engines. Keep them exported for
  `npx prisma migrate deploy` as well.
* If a host-specific engine target is unknown, `prisma` prints it in the error
  message (`could not be found` / `not available for ...`), and
  `node -p 'process.platform'` plus `ldd --version` give the same answer.

### Path 2 — ship the client, generate nothing on the server (recommended)

The client `prisma generate` would create is packed on the development machine
and unpacked on the server, so the host never contacts `binaries.prisma.sh`.

**On the development machine** (needs one working `npx prisma generate`):

```bash
npx prisma generate
npm run prisma:offline-bundle
#   + prisma-offline-client.tgz (31.2 MB)
#
#   Engines inside:
#     - libquery_engine-debian-openssl-3.0.x.so.node (15.4 MB)
#     - libquery_engine-linux-musl-openssl-3.0.x.so.node (15.4 MB)
#     - libquery_engine-rhel-openssl-1.1.x.so.node (15.4 MB)
#     - libquery_engine-rhel-openssl-3.0.x.so.node (15.4 MB)
```

`prisma/schema.prisma` lists the Linux targets next to `native`, so all four
engines are generated at once and the bundle works on Debian/Ubuntu, CloudLinux
and Alpine hosts. If the upload is slow, keep a single engine — the one the host
reports (run this **on the server**):

```bash
node -e "require('@prisma/get-platform').getBinaryTargetForCurrentPlatform().then(console.log)"
# debian-openssl-3.0.x

npm run prisma:offline-bundle -- --target debian-openssl-3.0.x   # ~10 MB tarball
```

**On the server** (upload the tarball first, ~31 MB in, ~65 MB unpacked):

```bash
cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate

# --ignore-scripts skips the npm lifecycle hooks. Safe for this project: the
# only packages that define one are prisma, @prisma/client and @prisma/engines,
# and all three are replaced by the tarball below.
npm install --ignore-scripts --include=dev

tar -xzf prisma-offline-client.tgz   # node_modules/.prisma/client + node_modules/@prisma/client
npm run build
```

Do **not** run `npx prisma generate` there afterwards: the extracted client is
already the generated one and picks its engine by platform at runtime. The tarball
is git-ignored; `npm run prisma:offline-bundle -- --help` lists the other options.

### Migrations when `binaries.prisma.sh` is unreachable

`prisma migrate deploy` needs the `schema-engine` binary, which is downloaded on
demand and cached outside `node_modules` — so Path 2 alone does not make it work.
Two ways out:

**Option A — bring the schema engine along.** On the development machine:

```bash
TARGET=debian-openssl-3.0.x
COMMIT=$(node -p "require('@prisma/engines-version').enginesVersion")
curl -fL -o "schema-engine-$TARGET.gz" \
  "https://registry.npmmirror.com/-/binary/prisma/all_commits/$COMMIT/$TARGET/schema-engine.gz"
gunzip -c "schema-engine-$TARGET.gz" > "schema-engine-$TARGET"
```

Upload it, then on the server:

```bash
mkdir -p ~/factor/engines && mv ~/schema-engine-debian-openssl-3.0.x ~/factor/engines/
chmod +x ~/factor/engines/schema-engine-debian-openssl-3.0.x

cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate
PRISMA_SCHEMA_ENGINE_BINARY="$HOME/factor/engines/schema-engine-debian-openssl-3.0.x" \
  npx prisma migrate deploy
```

`PRISMA_SCHEMA_ENGINE_BINARY` is the documented way to hand Prisma a locally
stored engine; `prisma migrate status` and `migrate resolve` accept it as well.
The file must be executable (`chmod +x`).

**Option B — apply the SQL with `psql`.** No Prisma binary at all; use it for the
first deploy, while the database is still empty:

```bash
cd ~/factor
PSQL_URL=$(printf '%s' "$DATABASE_URL" | cut -d'?' -f1)   # drop ?schema=public&connection_limit=5

psql "$PSQL_URL" -f prisma/migrations/20260926014009_init/migration.sql

CHECKSUM=$(sha256sum prisma/migrations/20260926014009_init/migration.sql | awk '{print $1}')
psql "$PSQL_URL" <<SQL
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "checksum" varchar(64) NOT NULL,
  "finished_at" timestamptz,
  "migration_name" varchar(255) NOT NULL,
  "logs" text,
  "rolled_back_at" timestamptz,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "applied_steps_count" integer NOT NULL DEFAULT 0
);
INSERT INTO "_prisma_migrations"
  ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
VALUES
  (gen_random_uuid()::text, '$CHECKSUM', now(), '20260926014009_init', now(), 1);
SQL
```

`_prisma_migrations.checksum` is the plain sha256 of the migration file — for
`20260926014009_init` it is
`fea059c7658902c69173311a1bf9c33d4310e284fe989fa32391eb7758b83642`, so the row above
makes a later `prisma migrate status` report "Database schema is up to date!"
instead of a modified migration. `gen_random_uuid()` needs PostgreSQL 13+; on
older servers replace it with a literal UUID. The `CREATE TYPE` statements at the
top of the migration are not idempotent, so never apply Option B twice.

### Path 3 — the npm registry is blocked as well

Then nothing can be installed on the host at all, so `node_modules` has to be
built on a Linux machine with the same Node **major** version (WSL, a small VPS,
or Docker) and uploaded:

```bash
# Linux/macOS/WSL shell, inside a fresh checkout
docker run --rm -v "$PWD:/app" -w /app node:20-bookworm-slim \
  sh -lc "npm install --include=dev && npx prisma generate && npm run build"
tar -czf factor-release.tgz node_modules .next
```

Upload the archive into `~/factor` and extract it there; on the server no `npm`
or `prisma` command runs at all, only:

```bash
tar -xzf factor-release.tgz
mkdir -p tmp && touch tmp/restart.txt
```

Keep the code itself in sync with `git pull` (or upload `src/`, `prisma/`,
`package.json`, `app.js`, `next.config.js`) — and rebuild + re-upload `.next`
whenever any of it changes, because the server cannot compile. Copying the folder
file by file over FTP is not enough: `node_modules` contains symlinked `bin/`
entries that only survive a tar/zip round trip.

## Known issues unrelated to cPanel

* `src/utils/companyAssets.ts` references `/assets/default-seal.png` and
  `/assets/default-signature.png`, but `public/assets/` is empty in the repo. Any
  company that keeps the `"default"` seal/signature setting will get a broken
  image on printed documents until those two files are added.
* The PDF letterhead importer (`src/components/invoice/LetterheadEditor.tsx`)
  loads its pdf.js worker from `cdnjs.cloudflare.com`, so the browser needs
  outbound internet access; nothing extra to install on the server.
* Uploaded logos/seals/signatures are stored as base64 data URLs inside the
  database (`companies.settings` JSON), so the ~5 MB server-action body limit in
  `next.config.js` is the real ceiling for those images — a shared host with a
  small PostgreSQL quota fills up quickly if many large logos are uploaded.



