# Deploying Factor on cPanel

This app is a Next.js 14 (App Router) application with Prisma + PostgreSQL. cPanel
runs Node.js apps through Phusion Passenger, so the deployment has three parts
that do not exist in a local setup:

1. Passenger needs a startup file — that is what `server.js` in the project root
   is for (`next start` cannot be used, see [Why `server.js`](#why-serverjs-exists)).
2. The production build is made on **your** machine and shipped as
   `deploy.zip`; the host only installs dependencies and applies the database
   migration — see [Deploy in one pass](#deploy-in-one-pass-the-normal-case).
3. The environment variables from `.env.example` must be set on the server.

---

## Deploy in one pass (the normal case)

Everything below is the long form. This is the flow actually in use.

**On your machine** (any OS; use the same Node *major* version as the server):

```bash
npm ci                 # installs the versions pinned in package-lock.json
npm run deploy         # = npm run build, then deploy.zip in the repo root
```

`next.config.js` sets `output: "standalone"`, so `next build` also writes a
self-contained `.next/standalone/`. The `postbuild` step copies `public/` and
`.next/static/` into it, and `deploy:zip` packs the result:

| Entry | Why it ships |
| --- | --- |
| `server.js` | Passenger startup file ([why it exists](#why-serverjs-exists)) |
| `.next/` | the prebuilt standalone output, incl. `.next/static` |
| `public/` | static assets |
| `package.json`, `package-lock.json` | the server's `npm install`; the lock keeps the host on the exact `next@14.2.35` the build used |
| `prisma/` | the `postinstall` hook runs `prisma generate`, and `npm run db:deploy` applies these migrations |
| `src/scripts/*.js` | `create:superadmin`, `reset:password` and `doctor`, plus the `.env` loader they share |

`node_modules/` and `.env` are deliberately **not** in the archive: CloudLinux
requires `node_modules` to be a symlink into the virtualenv, and the production
`.env` on the server must survive the upload.

**On the server:**

```bash
cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate

unzip -o deploy.zip                      # server.js, .next/, prisma/, ...
npm install                              # into the virtualenv; runs prisma generate
npm run db:deploy                        # only when prisma/migrations/ changed
mkdir -p tmp && touch tmp/restart.txt    # Passenger picks up the new build
```

Then check `https://example.com/login` returns `200` and not `503`. If a page
comes up blank or the login form does nothing, run `npm run doctor` on the server
first: it reports whether the running app has its environment, the build, the
Prisma client and the database ([login page goes blank](#the-login-page-goes-blank-when-you-submit-the-form)).

The host never runs `next build` — the archive already holds the compiled output.
That is what avoids the `pthread_create` abort and the "the build machine must
match the host" problem described under
[Troubleshooting](#pthread_create-resource-temporarily-unavailable-during-npm-run-build).
`unzip -o` overwrites files but never deletes the ones a previous release left
behind; add `rm -rf .next` before it if you want the directory to be pristine.

---

## 1. Requirements

| Requirement | Notes |
| --- | --- |
| cPanel with **Setup Node.js App** (Passenger) | Almost every cPanel host has it. If the icon is missing, ask support to enable "Node.js Selector", or use the [PM2 alternative](#appendix-b--pm2-instead-of-passenger). |
| Node.js **18.17 or newer** | Pick 18/20/22 in the Node.js Selector. Next.js 14 refuses to build on older versions. |
| A **PostgreSQL** database | See [step 2](#2-create-the-database). PostgreSQL, not MySQL — the schema uses enums and `JSONB`. |
| Terminal / SSH access | `npm install`, `prisma migrate deploy` and `npm run build` cannot be done through the File Manager. If your plan has no terminal, see [Appendix A](#appendix-a--no-terminal-access). |
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
first — see [Appendix C](#appendix-c--mysql-instead-of-postgresql).

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
| Application startup file | `server.js` |

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

Whichever way you set things up, **also create `.env` if you use the cPanel UI**.
The two are not interchangeable for commands you type in a shell:

* Variables from the cPanel UI are injected into the Passenger process, so only
  the running app sees them — an SSH session does not. A command that works in
  the app can therefore still fail with
  `Environment variable not found: DATABASE_URL`.
* The Prisma CLI reads `.env` from the project, so run `db:deploy` / `db:status`
  from the application root.
* Prisma **Client** resolves its `.env` next to the generated client, which on
  this stack sits inside the virtualenv
  (`~/nodevenv/<app>/<version>/lib/node_modules/.prisma/client/../../../.env`).
  That path is not the one you would guess, so `create:superadmin`,
  `reset:password` and `doctor` load the app-root `.env` and `.env.local`
  themselves (`src/scripts/load-env.js`). Values you pass on the command line, or
  set in the cPanel UI, still win over the file.
* The app reads that *same* file: the Next server loads `.env` from the
  application root when it boots, so one file configures both the app and your
  shell. A process keeps the values it started with, so restart the app after
  editing it (`touch tmp/restart.txt`).

`npm run doctor` prints what both of them resolve to — which files were read, and
whether each variable is set — without printing any secret.

## 6. Install dependencies and build

You can skip the `npm run build` below. The normal flow ships an already-built
`.next/` inside `deploy.zip`, so the host only has to run `npm install` and never
builds — see [Deploy in one pass](#deploy-in-one-pass-the-normal-case). Continue
here only if you cannot build locally and must compile on the host.

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

Adapt the two paths: the venv is `/home/<user>/nodevenv/<app>/<node-major>/…`, so a
Node 22 application on user `sftgroup` activates with
`source /home/sftgroup/nodevenv/factor/22/bin/activate`.

A successful build ends with a route table (`○ /login`, `ƒ /`, ...) and writes
`.next/`. The `prisma postinstall` hook works even in production mode because
`prisma` is listed in `dependencies`, not `devDependencies`.

> **Use the pinned CLI, never bare `npx prisma`.** `npx` only uses the local CLI
> when it is actually installed; otherwise it downloads the `latest` dist-tag
> from the npm registry, and that is no longer Prisma 5 (at the time of writing
> `prisma@latest` is `8.0.0-rc.22` with `@prisma/composer 0.29.1`, where
> `generate`/`migrate` have other names). The symptom is
> `✘ [CLI.UNKNOWN_COMMAND] No command registered for \`generate\`` plus an
> "agent skills" notice. Use the npm scripts (`npm run prisma:generate`,
> `npm run db:deploy`) or `./node_modules/.bin/prisma …`: both always resolve the
> version pinned in `package-lock.json` (5.22.0).

On cPanel the `node_modules` folder in the application root must stay a
**symlink** into the virtualenv; the Node.js Selector's `npm` wrapper refuses to
run while a real folder with that name is there. Never extract an archive that
contains a `node_modules/` entry into the application root (see
[Troubleshooting](#cloudlinux-nodejs-selector-node_modules-must-be-a-symlink)).

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

npm run db:deploy             # = ./node_modules/.bin/prisma migrate deploy
npm run db:status             # -> "Database schema is up to date!"

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

1. `npm run doctor` reports no `FAIL` lines: it checks the environment the app
   actually runs with, the shipped build, the Prisma client and the database.
2. `curl -I https://example.com/login` → `200 OK` and an `x-powered-by: Next.js`
   style response (not `503`).
3. Open `https://example.com/login` and sign in with the superadmin account. A
   superadmin is not attached to a company, so the dashboard layout redirects
   them straight to the admin panel at `https://example.com/admin` — see
   [Using the admin panel](#9-using-the-admin-panel-admin).
4. cPanel → Setup Node.js App shows the app as running; startup errors appear in
   the log file listed there (`~/logs/...` or `stderr.log` in the app root).

## 9. Using the admin panel (`/admin`)

Sign in at `/login` with the email/password you passed to
`npm run create:superadmin`. A superadmin belongs to no company, so the
dashboard layout sees `role: "superadmin"` and redirects straight to
`https://example.com/admin` — that page, plus `/account`, is all the account can
reach. Its sidebar is labelled **پنل مدیر سامانه** and lists only
*شرکت‌ها و حساب‌ها*.

From `/admin` you can:

* **Create a company** — its name plus the first company user, whose
  email/password you type here. This is how every tenant account is born; the
  panel creates companies, it does not issue invoices itself.
* **Activate / deactivate** a company (`فعال` / `غیرفعال`). While a company is
  inactive, `getAuthContext()` returns `null` for its users, so they are bounced
  to `/login` until you switch it back on.
* **Open a company** (`/admin/companies/<id>`) to list its users and add more of
  them, as either a company user or another superadmin.

The whole panel is gated by `requireSuperadmin()` (`src/lib/guards.ts`) inside
`src/server/actions/admin.ts`, and by the redirect in
`src/app/(admin)/layout.tsx` — a company user who types `/admin` is returned to
`/`. The same operations are reachable from scripts via `POST /api/admin` with
`{"action":"list_companies" | "create_company" | "set_company_active" |
"invite_user", …}` and a valid session cookie.

### Managing the superadmin password

| Situation | What to do |
| --- | --- |
| Signed in, want a new password | sidebar → *حساب کاربری* (`/account`), minimum 8 characters |
| Forgot it, shell available | `npm run reset:password -- you@example.com "new-password"` |
| Forgot it, no shell | `/login` → *رمز عبور خود را فراموش کرده‌اید؟* → `/account?mode=recover` |
| Locked out of everything | `npm run create:superadmin -- you@example.com "new-password"` |

The two shell commands run from `~/factor`, with the virtualenv active
(`source /home/cpaneluser/nodevenv/factor/20/bin/activate`). The `--` is what
makes npm forward the email and password to the script; the web forms enforce the
8-character minimum themselves, the CLI scripts hash whatever you give them with
bcrypt (cost 12, same as `src/lib/password.ts`).

`create:superadmin` is an upsert: it replaces the password *and* forces
`role: "superadmin"`, so it also re-promotes an account whose role was changed by
mistake. `reset:password` never touches `role` or `companyId` — it only rewrites
the hash, which makes it the safe choice for a company user's password.

The `?mode=recover` link is not emailed yet; it is written to the server log as
`[recover] https://…/account?recovery_token=…` and expires after one hour — see
[Password-recovery link](#password-recovery-link). Reading the log is what the
`APP_URL` value is for.

## Updating an existing deployment

Upload the new `deploy.zip` to `~/factor` first, then:

```bash
cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate

unzip -o deploy.zip           # server.js, .next/, public/, prisma/, ...
npm install                   # only when package.json/package-lock.json changed
npm run db:deploy             # only when prisma/migrations/ changed
mkdir -p tmp && touch tmp/restart.txt
```

Because the build is made on your machine, the archive already contains the
finished `.next/`. Passenger keeps serving the old build until the restart, so
the downtime is that single restart.

If `prisma/schema.prisma` changed **and** the host cannot reach
`binaries.prisma.sh`, re-create and re-upload the offline bundle
(`npm run prisma:generate && npm run prisma:offline-bundle`, then `tar -xzf` on
the server — see [Appendix D](#appendix-d--offline-install-no-access-to-binariesprismash)).
The bundle uploaded earlier contains the old client.

## Troubleshooting

### `Environment variable not found: DATABASE_URL` from a shell command

Prisma aborts before it connects: the variable was not in the environment of that
process. It is not a database problem, and it does not mean the value is wrong.

The most common cause is that the values only exist in the cPanel UI. Those are
injected into the Passenger process, so the app works while every command you
type in SSH fails. Put them in a file as well
([5. Configure the environment](#5-configure-the-environment)) — the archive does
not ship `.env.example`, so write the file out directly:

```bash
cd ~/factor
cat > .env <<'EOF'
DATABASE_URL="postgresql://cpaneluser_dbuser:PASSWORD@localhost:5432/cpaneluser_factordb?schema=public&connection_limit=5&pool_timeout=20"
SESSION_SECRET="paste-a-long-random-string"
APP_URL="https://example.com"
EOF
chmod 600 .env
```

Every command in this document starts from a fresh shell, so load the file into
it before running anything else:

```bash
set -a && source .env && set +a
```

That also covers an older copy of the scripts, which relied on Prisma finding the
file by itself.

Or hand the value to one command, without creating anything:

```bash
DATABASE_URL="postgresql://cpaneluser_dbuser:pass@localhost:5432/cpaneluser_factordb" \
  npm run db:deploy
```

`create:superadmin` and `reset:password` read the app-root `.env` and `.env.local`
themselves, and an exported or inline variable always wins over the file. To see
which files were read:

```bash
node -e "console.log(require('./src/scripts/load-env').files)"
```

### The login page goes blank when you submit the form

No message, no error, an empty page — that is what a Server Action that *throws*
looks like in a production build. The action is answered with an error, and React
has no boundary to hand it to, so the tree under the root layout is unmounted.
`src/app/error.tsx` now renders the failure instead (with its digest, which
matches an entry in the app log), and the auth actions turn the usual causes into
a Persian message on the form — but the cause itself still has to be fixed on the
host.

Run the check first; it reports what the *running* process sees:

```bash
cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate
npm run doctor
```

Each `FAIL` line is a separate cause:

* `DATABASE_URL` / `SESSION_SECRET` **not set** → the app process has no
  environment. The values in the cPanel UI are injected into Passenger when it
  starts, so adding them there does nothing to the app already running. Create
  the app-root `.env` ([5. Configure the environment](#5-configure-the-environment))
  **and** restart (`touch tmp/restart.txt`).
* `connection` fails with `Can't reach database server` / `Authentication failed`
  → `DATABASE_URL` is wrong, or PostgreSQL is not running. The check runs the same
  `select 1` the app would.
* `migrations` or `tables` **FAIL** → `npm run db:deploy` was never run (or ran
  against another database), so the login query has no table to read. Until the
  schema exists no account tooling works either.
* `generated client` / `query engines` **FAIL** → `npm install` did not complete
  its `postinstall` (`prisma generate`); see
  [Appendix D](#appendix-d--offline-install-no-access-to-binariesprismash).

If `/login` is empty *before* you submit — no form at all — it is not the action.
`curl -s https://example.com/login | wc -c` tells the two apart: a healthy page is
tens of kilobytes; an empty or a few hundred bytes means the request itself failed
(check the app log, and the sections above).

### The form submits, you land back on `/login`, and no error is shown

That is a *successful* action: the password was accepted and a session cookie was
issued — but the browser did not keep it. In production the session cookie is
marked `Secure` ([session.ts](src/lib/session.ts)), and a browser silently
discards a `Secure` cookie that arrives over `http://`. Nothing in the response
says so, and the redirect to `/` is then answered by the guard with a redirect
back to `/login`.

Open the site over `https://` and it works. `http://example.com` cannot hold a
session at all, even while the page renders and every request returns 200.

Confirm it in the browser in ten seconds: submit the form, open DevTools →
Network → the `POST /login` entry → the response must carry
`Set-Cookie: factor_session=…; Secure`. A `Secure` cookie on a page you opened
over `http://` is the whole problem.

`npm run doctor` reports the same thing as a `FAIL` when the cookie is Secure
while `APP_URL` is `http://`, and the app logs a warning to `stderr.log` the
first time it hands out a cookie over plain HTTP.

To unblock a site that has no working certificate yet:

```bash
cd ~/factor
grep -q SESSION_COOKIE_SECURE .env || echo 'SESSION_COOKIE_SECURE="false"' >> .env
touch tmp/restart.txt
```

Remove that line once the site is on HTTPS: unset, cookies are `Secure` in
production automatically. The usual reason a certificate is missing or ignored
is that it has **expired** — check that from outside the server:

```bash
curl -sI https://example.com/login | head -1        # want HTTP/1.1 200 OK

# Which certificate is served, for which name, and is it still valid?
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | grep -E "subject=|NotAfter|Verify return code"
```

Two shapes of broken HTTPS both leave the site HTTP-only, so read both lines: `Verify
return code: 10 (certificate has expired)` means it expired, and a `subject=` that
names **another** host means no certificate is installed for this domain at all —
cPanel then serves its own `cpanel.<server>` certificate, which every browser rejects
as a name mismatch. In that case AutoSSL was never issued: run it from the domain's
own row in cPanel → **SSL/TLS Status** (not the account-level one), after checking
that the domain's DNS A record points at this server. Do not paper over it by telling
people to click through the warning: the address they then use still determines
whether a session can be kept, and any `http://` link re-enters the broken case.

cPanel → **SSL/TLS Status** → **Run AutoSSL** renews it. Until then, anyone on
`http://` — or clicking through the browser's certificate warning — cannot stay
signed in.

### 503 Service Unavailable right after setup

Passenger could not start the process. Useful checks:

* Application startup file must be `server.js` (not `index.js`, and not the
  `.next/standalone/server.js` Next generates).
* Run it by hand to see the real error:
  `cd ~/factor && source /home/cpaneluser/nodevenv/factor/20/bin/activate && node server.js`
  It must print `[server] Next.js ready on socket ...`.
* `[server] failed to start Next.js: Could not find a production build` → `npm run build` was not run.
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
* Wrong or missing Prisma query engine for the host OS:
  `Query engine library for current platform "debian-openssl-1.1.x" could not be found`.
  The target in that message is the one this host resolved for itself, and the
  generated client has to contain the matching
  `libquery_engine-<target>.so.node`. `prisma/schema.prisma` lists five Linux
  targets, so re-generate locally and re-upload the bundle
  ([Appendix D, Path 2](#path-2--ship-the-client-generate-nothing-on-the-server-recommended)),
  or drop the single missing file in by hand
  ([Path 2b](#path-2b--download-a-single-engine-file-by-hand)). Running
  `npx prisma generate` **on the server** cannot fix it while
  `binaries.prisma.sh` is unreachable.
* Engine file present, but the loader rejects it (`GLIBC_2.xx not found`,
  `libssl.so.1.1: cannot open shared object file`, `version CXXABI_1.3.11 not
  found`): the engine was built for a different libc/OpenSSL than the host runs.
  The bundle ships the glibc-2.17 RHEL builds for exactly this case, so point the
  client at one of them instead of re-generating:
  `export PRISMA_QUERY_ENGINE_LIBRARY="$(dirname "$(readlink -f node_modules)")/.prisma/client/libquery_engine-rhel-openssl-1.1.x.so.node"`
  (absolute path, executable). Check the host first with
  `ldd --version | head -1` and `openssl version`.

### Cloudlinux NodeJS Selector: node_modules must be a symlink

```text
Cloudlinux NodeJS Selector demands to store node modules for application in separate folder
(virtual environment) pointed by symlink called "node_modules". That's why application
should not contain folder/file with such name in application root
```

cPanel's Node.js Selector keeps every package in the virtualenv and expects the
application root to contain only a **symlink** to it
(`node_modules -> /home/user/nodevenv/factor/20/lib/node_modules`). Its `npm`
wrapper refuses to run while a real folder with that name is present — the
message above is printed *instead of* running npm, so nothing was installed.

The usual cause during a deployment is a `tar`/ZIP extract of an archive that has
a `node_modules/` entry: GNU tar replaces the symlink with a real folder. Check
what you have:

```bash
cd ~/factor
ls -ld node_modules        # symlink -> .../lib/node_modules, or a real directory
```

If it is a real folder — probably an upload from Windows or an unpacked offline
bundle — remove it, restore the symlink and install into the virtualenv:

```bash
cd ~/factor
rm -rf node_modules                                    # after the check above
ln -s "$HOME/nodevenv/factor/20/lib/node_modules" node_modules

npm install --ignore-scripts --include=dev
tar -xzf prisma-offline-client.tgz -C "$(dirname "$(readlink -f node_modules)")"
```

Clicking **Run NPM Install** (Application Manager → app → *Enable Dependencies*,
or Setup Node.js App) recreates the symlink too, and is the supported way.
Afterwards never extract an archive containing `node_modules` with a plain
`tar -xzf` in the application root: pass `-C "$(dirname "$(readlink -f node_modules)")"`
or `tar --keep-directory-symlink`.

### Prisma cannot download its engines (`binaries.prisma.sh`)

Symptoms during `npm install` or `npx prisma generate`:

```text
Error: Failed to fetch sha256 checksum at https://binaries.prisma.sh/all_commits/605197351a3c8bdd595af2d2a9bc3025bca48ea2/debian-openssl-3.0.x/libquery_engine.so.node.gz.sha256 - 403
request to https://binaries.prisma.sh/... failed, reason: connect ETIMEDOUT
```

The engines are not part of the npm package, they are downloaded from Prisma's
own host. Note the target in that URL (`debian-openssl-1.1.x`, `rhel-openssl-3.0.x`,
…) — it is the one this host needs — then either point Prisma at a mirror, ship the
generated client, or copy that single engine file in by hand. All three are
described in
[Appendix D](#appendix-d--offline-install-no-access-to-binariesprismash).

### Wrong Prisma CLI (`No command registered for generate`)

```text
✘ [CLI.UNKNOWN_COMMAND] No command registered for `generate`
→ List every command: prisma --help
Prisma agent skills are out of date (installed @prisma/composer 0.29.1, synced none). Run: prisma skills sync
```

That is not this project's CLI. `npx` falls back to downloading the `latest`
dist-tag from the npm registry when no local CLI is installed, and `prisma@latest`
is now Prisma 8 (`8.0.0-rc.22` with `@prisma/composer 0.29.1`), where the commands
have other names (`migrate` → `migration`, no `generate`). This project pins
**5.22.0** in `package-lock.json` and its scripts (`postinstall`, `db:deploy`, …)
rely on that version.

```bash
cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate

ls -l node_modules/.bin/prisma          # must exist
./node_modules/.bin/prisma -v           # prisma: 5.22.0, @prisma/client: 5.22.0
```

If that file is missing, the project was never installed into the virtualenv —
extracting the offline bundle only adds `@prisma/client` and `.prisma/client`, no
CLI and no Next.js. Run `npm install --ignore-scripts --include=dev` (see
[step 6](#6-install-dependencies-and-build)), then use the npm scripts
(`npm run db:status`, `npm run db:deploy`, `npm run prisma:generate`) or
`npx --no-install prisma …`, which fails loudly instead of silently installing
another major version.

### Login redirects back to /login in a loop

The session cookie was dropped by the browser — a `Secure` cookie on a page served
over plain HTTP. See
[The form submits, you land back on `/login`, and no error is shown](#the-form-submits-you-land-back-on-login-and-no-error-is-shown)
for the two-minute check and both fixes.

### `npm ERR!` / build fails on missing typescript

`npm install` was run in production mode. Re-run `npm install --include=dev`.

### `pthread_create: Resource temporarily unavailable` during `npm run build`

The build compiles fine and then aborts while **Collecting page data**:

```text
 ✓ Compiled successfully
 ✓ Linting and checking validity of types
   Collecting page data  ...node[169554]: pthread_create: Resource temporarily unavailable
 ⨯ Next.js build worker exited with code: null and signal: SIGABRT
```

This is not an application bug. For "Collecting page data" Next forks one build
worker per CPU — its default is `os.cpus().length - 1`, i.e. ~31 on a 32-core
host — and each worker starts its own thread pool. A cPanel/CloudLinux account
caps the total number of processes and threads it may create, so on a many-core
shared host that limit is hit and `pthread_create` fails with `EAGAIN`.

`next.config.js` already pins the build to a single worker:

```js
experimental: {
  cpus: 1,
  webpackBuildWorker: false,
}
```

If a build still aborts (some hosts set `ulimit -u` very low), shrink the
per-process thread pool too and retry:

```bash
UV_THREADPOOL_SIZE=1 npm run build
```

If it keeps failing, the account cannot fork enough processes at all. Build the
release elsewhere and upload only the build output (same Node **major** version
as the app — 22 here):

```bash
# Linux/WSL/Docker, inside a fresh checkout of the same commit
docker run --rm -v "$PWD:/app" -w /app node:22-bookworm-slim \
  sh -lc "npm install --include=dev && npx prisma generate && npm run build"
tar -czf factor-release.tgz .next
```

Upload `factor-release.tgz` into `~/factor` and extract just the build output —
`node_modules` must stay the virtualenv symlink
(`tar -xzf factor-release.tgz -C ~/factor .next`). See
[Appendix A](#appendix-a--no-terminal-access) and
[Path 3 in Appendix D](#path-3--the-npm-registry-is-blocked-as-well).

> The unrelated `You are using a non-standard "NODE_ENV" value` warning means the
> shell or Passenger exports `NODE_ENV` as something other than
> `development`/`production`/`test` (frequently an empty value). It does not cause
> the abort, but silence it with `unset NODE_ENV` (or `export NODE_ENV=production`)
> before building.


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

## Why `server.js` exists

cPanel serves Node apps through Phusion Passenger. Passenger starts the process
and passes the listening socket in `PORT`, usually as a **filesystem path**
(`/home/user/tmp/passenger-xxxx/socket`) rather than a port number. Next's stock
`next start` and its generated `output: "standalone"` server both do
`parseInt(process.env.PORT, 10) || 3000`, so they would listen on TCP 3000 where
Passenger never looks, and the site would return 503 while the app looked healthy
in the log.

`server.js` avoids that by starting Next's own request handler
(`next({ dev: false })` + `getRequestHandler`) and listening on Passenger's
socket; if `PORT` is numeric it listens on `0.0.0.0:$PORT` instead, so
`npm run serve` also works on a plain VPS or inside a container.

`next.config.js` sets `output: "standalone"`, so `next build` additionally emits
a self-contained `.next/standalone/` (its own minimal `node_modules` plus a
`server.js`) that can be built off the host and shipped as a release. On
Passenger our root `server.js` is still the entry point — the `server.js` Next
generates parses `PORT` with `parseInt()` and would miss Passenger's socket.

Because our `server.js` is a *custom* server, it is not handed the resolved
config the way Next's generated one is. It therefore reads that config back from
`.next/required-server-files.json` and exports it as
`__NEXT_PRIVATE_STANDALONE_CONFIG` before `require("next")`. Without that step a
custom server cannot start from a standalone bundle at all — the traced
`node_modules` has no `webpack/bundle5`, so `loadConfig()` aborts with
`Cannot find module './bundle5'` — and `experimental.serverActions.bodySizeLimit`
would silently fall back to 1 MB. See the comment block at the top of
`server.js`.

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
   `./node_modules/.bin/prisma migrate resolve --applied 20260926014009_init`.

## Appendix B — PM2 instead of Passenger

On a VPS-style cPanel account (Terminal + PM2 available) you can skip the Node.js
Selector and run the built app as a plain process:

```bash
npm ci --include=dev && npm run build
PORT=3000 NODE_ENV=production pm2 start server.js --name factor
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

The **platform target** in the same URL (`debian-openssl-3.0.x` above) is the one
the host resolved for itself, and both parts are reused in every command below.
A cPanel/CloudLinux box with OpenSSL 1.1 asks for `debian-openssl-1.1.x` instead,
so read the target from the actual error (or ask the server) **before** packing
anything:

```bash
node -e "require('@prisma/get-platform').getBinaryTargetForCurrentPlatform().then(console.log)"
# debian-openssl-1.1.x   <- what this host needs
```

If that target is not listed in `binaryTargets` in `prisma/schema.prisma`, add it
there and re-generate; otherwise the engine it asks for is simply not in the
bundle.

Four ways to get past the block, depending on how much of the install works:

* [Path 1](#path-1--point-prisma-at-a-mirror-fastest) — the host can reach
  `registry.npmmirror.com`, so only Prisma's download URL has to be redirected.
* [Path 2](#path-2--ship-the-client-generate-nothing-on-the-server-recommended) —
  the npm registry works, but no engine download is possible at all.
* [Path 2b](#path-2b--download-a-single-engine-file-by-hand) — one engine file is
  all that is missing.
* [Path 3](#path-3--the-npm-registry-is-blocked-as-well) — the npm registry is
  blocked too, so everything is prebuilt on a Linux machine.

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
* The target in the error URL is the one this host resolved for itself
  (`debian-openssl-1.1.x` on a CloudLinux box with OpenSSL 1.1). If it is not in
  `binaryTargets` in `prisma/schema.prisma`, add it there first — the mirror has
  the same files under the same paths.

### Path 2 — ship the client, generate nothing on the server (recommended)

The client `prisma generate` would create is packed on the development machine
and unpacked on the server, so the host never contacts `binaries.prisma.sh`.

**On the development machine** (needs one working `npx prisma generate`):

```bash
npx prisma generate
npm run prisma:offline-bundle
#   + prisma-offline-client.tgz (38.2 MB)
#
#   Engines inside:
#     - libquery_engine-debian-openssl-1.1.x.so.node (15.4 MB)
#     - libquery_engine-debian-openssl-3.0.x.so.node (15.4 MB)
#     - libquery_engine-linux-musl-openssl-3.0.x.so.node (15.4 MB)
#     - libquery_engine-rhel-openssl-1.1.x.so.node (15.4 MB)
#     - libquery_engine-rhel-openssl-3.0.x.so.node (15.4 MB)
```

`prisma/schema.prisma` lists the Linux targets next to `native`, so all five
engines are generated at once: Debian/Ubuntu with OpenSSL 1.1 or 3.0,
CloudLinux/AlmaLinux/CentOS with OpenSSL 1.1 or 3.0, and Alpine (musl).

Before packing, check which target the host actually asks for. Its failed download
names it (`.../debian-openssl-1.1.x/libquery_engine.so.node.gz.sha256`), and so
does this, run **on the server**:

```bash
node -e "require('@prisma/get-platform').getBinaryTargetForCurrentPlatform().then(console.log)"
# debian-openssl-1.1.x
```

If that value is missing from the list above, add it to `binaryTargets` in
`prisma/schema.prisma`, run `npx prisma generate` again and re-pack. When the
upload is slow, ship one engine only:

```bash
npm run prisma:offline-bundle -- --target debian-openssl-1.1.x   # ~10 MB tarball
```

**On the server** (upload the tarball first, ~38 MB in, ~80 MB unpacked):

```bash
cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate

# --ignore-scripts skips the npm lifecycle hooks. Safe for this project: the
# only packages that define one are prisma, @prisma/client and @prisma/engines,
# and all three are replaced by the tarball below.
npm install --ignore-scripts --include=dev

# cPanel's Node.js Selector requires node_modules in the application root to be
# a symlink into the virtualenv, and the tarball contains a node_modules/ folder
# entry: plain `tar -xzf` would replace that symlink with a real folder, after
# which npm refuses to run. So extract into the folder the symlink points to.
ls -ld node_modules                                     # symlink -> .../lib/node_modules
tar -xzf prisma-offline-client.tgz -C "$(dirname "$(readlink -f node_modules)")"

npm run build
```

`tar --keep-directory-symlink -xzf prisma-offline-client.tgz` in the application
root does the same thing. Order matters: install first, extract the bundle
second, build last — `npm install` reifies the dependency tree and can drop
folders it does not know about, `.prisma` among them. Do **not** run
`npx prisma generate` there afterwards:
the extracted client is already the generated one and picks its engine by
platform at runtime. For the migration commands prefer `./node_modules/.bin/prisma`
(or the npm scripts) over `npx prisma` — see
[wrong Prisma CLI](#wrong-prisma-cli-no-command-registered-for-generate).
The tarball is git-ignored; `npm run prisma:offline-bundle -- --help` lists the
other options.

### Path 2b — download a single engine file by hand

Sometimes only one engine file is missing — `npx prisma generate` on the server
stops at its very first download, or a previous deploy already left a generated
client that only lacks the engine for this host's target. Then uploading 38 MB is
not necessary: one engine is 7.4 MB compressed (for `debian-openssl-1.1.x`).

On the development machine (or any machine that can reach the mirror):

```bash
TARGET=debian-openssl-1.1.x                                     # from the error URL / from the server
COMMIT=605197351a3c8bdd595af2d2a9bc3025bca48ea2                  # node -p "require('@prisma/engines-version').enginesVersion"

BASE="https://registry.npmmirror.com/-/binary/prisma/all_commits/$COMMIT/$TARGET"
# if binaries.prisma.sh is reachable from here, use:
# BASE="https://binaries.prisma.sh/all_commits/$COMMIT/$TARGET"

curl -fL -o libquery_engine.gz "$BASE/libquery_engine.so.node.gz"
curl -fL -o libquery_engine.gz.sha256 "$BASE/libquery_engine.so.node.gz.sha256"
sha256sum libquery_engine.gz          # 99ccc47aa11fb40ec7db97acb2f481fc6323cd0c4431273ceb4d1ae89a5105e7
# (Windows: Get-FileHash libquery_engine.gz -Algorithm SHA256)

gunzip -c libquery_engine.gz > "libquery_engine-$TARGET.so.node"
sha256sum "libquery_engine-$TARGET.so.node"   # bc2976be96a9f6abeeb9e2d6626aa5cb2837d852bb61816c2c84c13ec13387b4
```

Upload `libquery_engine-$TARGET.so.node` and drop it into the **generated
client**, i.e. the folder `prisma-client-js` writes to:

```bash
cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate   # your own venv path

CLIENT="$(dirname "$(readlink -f node_modules)")/.prisma/client"
ls "$CLIENT" | head                     # index.js, default.js, schema.prisma, ...
mv ~/libquery_engine-debian-openssl-1.1.x.so.node "$CLIENT/"
chmod +x "$CLIENT"/libquery_engine-*.so.node
```

* The file name matters: at runtime the client looks for exactly
  `libquery_engine-<target>.so.node`, using the target it resolved for this host.
* **This only completes a client that is already there.** `index.js`,
  `default.js` and `schema.prisma` are produced by `prisma generate`, which itself
  needs the engines — so if `$CLIENT` is empty, use Path 2 instead (its tarball
  carries both halves).
* Nothing has to be copied at all if the client is pointed at the file:
  `export PRISMA_QUERY_ENGINE_LIBRARY="$HOME/factor/engines/libquery_engine-debian-openssl-1.1.x.so.node"`
  (absolute path, executable). Useful for trying a second target without
  re-generating — see the *500 error on every request* entry under
  [Troubleshooting](#500-error-on-every-request).

### Migrations when `binaries.prisma.sh` is unreachable

`prisma migrate deploy` needs the `schema-engine` binary, which is downloaded on
demand and cached outside `node_modules` — so Path 2 alone does not make it work.
Two ways out:

**Option A — bring the schema engine along.** On the development machine:

```bash
TARGET=debian-openssl-1.1.x     # your host's target, from the server error
COMMIT=$(node -p "require('@prisma/engines-version').enginesVersion")
curl -fL -o "schema-engine-$TARGET.gz" \
  "https://registry.npmmirror.com/-/binary/prisma/all_commits/$COMMIT/$TARGET/schema-engine.gz"
gunzip -c "schema-engine-$TARGET.gz" > "schema-engine-$TARGET"
```

Upload it, then on the server:

```bash
TARGET=debian-openssl-1.1.x     # same value as above
mkdir -p ~/factor/engines && mv ~/"schema-engine-$TARGET" ~/factor/engines/
chmod +x ~/factor/engines/"schema-engine-$TARGET"

cd ~/factor
source /home/cpaneluser/nodevenv/factor/20/bin/activate
./node_modules/.bin/prisma -v      # must print 5.22.0 — see the wrong-CLI entry below

PRISMA_SCHEMA_ENGINE_BINARY="$HOME/factor/engines/schema-engine-$TARGET" \
  ./node_modules/.bin/prisma migrate deploy
```

`PRISMA_SCHEMA_ENGINE_BINARY` is the documented way to hand Prisma a locally
stored engine; `prisma migrate status` and `migrate resolve` accept it as well.
The file must be executable (`chmod +x`). Always call the CLI through
`./node_modules/.bin/prisma` (or `npx --no-install prisma`) here: a bare
`npx prisma` would download `prisma@latest` — Prisma 8, where `migrate` is called
`migration` — whenever the pinned CLI is missing
([Troubleshooting](#wrong-prisma-cli-no-command-registered-for-generate)).

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
cd ~/factor

# node_modules must stay a symlink into the virtualenv (see Troubleshooting);
# the Selector creates it, add it by hand only if it is missing:
ls -ld node_modules || ln -s "$HOME/nodevenv/factor/20/lib/node_modules" node_modules

tar -xzf factor-release.tgz -C "$(dirname "$(readlink -f node_modules)")" node_modules
tar -xzf factor-release.tgz .next

mkdir -p tmp && touch tmp/restart.txt
```

The first `tar` writes the packages next to the symlink's target (a plain
`tar -xzf` in the root would replace the symlink with a real folder and break the
Selector); the second one only unpacks the build output.

Keep the code itself in sync with `git pull` (or upload `src/`, `prisma/`,
`package.json`, `server.js`, `next.config.js`) — and rebuild + re-upload `.next`
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



