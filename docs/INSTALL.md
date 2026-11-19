# Installing NeoAMS

Two ways to run it:

- **[Docker](#docker)** — the whole stack in containers. This is the way to
  put it on a server.
- **[From the sources](#from-the-sources)** — Bun on the machine. This is
  the way to work on it.

Either way, the first thing you do is open the site and create the first
administrator.

---

## Before you start

| What                                   | Why                           |
| :------------------------------------- | :---------------------------- |
| A Linux server with Docker             | The production runtime        |
| A domain name pointing at the server   | Caddy obtains the certificate |
| Ports 80 and 443 open                  | The web traffic               |
| A copy of the database taken regularly | The only real backup          |

The system stores everything in one SQLite file plus a folder of images.
Both are small, and both are easy to back up.

---

## Docker

### 1. Get the code

```bash
git clone <your-repository> neoams
cd neoams
```

### 2. Set the environment

```bash
cp .env.example .env
```

Edit `.env`. Three values matter:

```env
# A random secret. Never reuse one from a development machine.
BETTER_AUTH_SECRET=<output of: openssl rand -hex 32>

# The address the system is reached at.
PUBLIC_URL=https://lodge.example.com

# The host name Caddy answers for.
DOMAIN=lodge.example.com

# Where the certificate notices go.
ACME_EMAIL=you@example.com
```

`FRONTEND_URL` and `BETTER_AUTH_URL` are both set from `PUBLIC_URL` by the
compose file, so a write from any other origin is refused.

### 3. Start it

```bash
docker compose up -d --build
docker compose ps
```

Caddy asks Let's Encrypt for a certificate the first time it starts. It
takes a minute; watch it with:

```bash
docker compose logs -f caddy
```

### 4. Create the first administrator

Open `https://lodge.example.com`. The site asks for the first administrator:

- **Name** — how the person is shown in the interface.
- **Email** — their sign-in name.
- **Password** — at least 10 characters.

That account is the only one that can create properties and staff. Once it
exists, the setup page is closed for good.

> If you set `SETUP_TOKEN` in `.env`, the setup page asks for it as well.
> Useful when the server is briefly reachable before you are ready.

### 5. Check it

```bash
curl https://lodge.example.com/api/v1/setup/status
# {"needsSetup":false,"setupTokenRequired":false}
```

A `500` here means the API cannot reach its database. Check
`docker compose logs api`.

---

## From the sources

### 1. Prerequisites

- [Bun](https://bun.sh) 1.4 or newer
- Node.js 22 or newer (only for the production web build)

### 2. Install

```bash
bun install
```

### 3. Configure

```bash
cp .env.example .env
```

For development, the defaults are right:

```env
DB_FILE_NAME=apps/api/neoams.sqlite
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
```

### 4. Run

Two terminals:

```bash
# the API
bun run --filter neoams-api dev
```

```bash
# the web app
bun run --filter neoams-web dev
```

The API is on `http://localhost:3000`, the web app on
`http://localhost:5173`. Open the web app.

The schema is created automatically on the first start, so there is no
migration step to forget. To apply the migrations by hand instead:

```bash
bun run --filter neoams-api db:migrate
```

### 5. Production build

```bash
bun run --filter neoams-web build
node apps/web/build/index.js
```

The web app needs `ORIGIN` and `HOST`:

```bash
ORIGIN=https://lodge.example.com HOST=0.0.0.0 PORT=3000 node apps/web/build/index.js
```

---

## Backups

The database is one SQLite file. `scripts/backup.sh` copies it with
SQLite's own `.backup` command, which takes a lock and writes a consistent
snapshot even while the server is running.

```bash
# From the sources
scripts/backup.sh apps/api/neoams.sqlite

# In Docker: run it inside the api container, where the file lives.
docker compose exec api sh -c 'cd /app && bun run scripts/backup.sh /data/neoams.sqlite /data/uploads'
```

Both write to `backups/neoams-<timestamp>/`, which holds:

- `neoams.sqlite` — the database
- `neoams.sqlite.sha256` — a checksum, so a restore can be checked
- `uploads/` — the images

### Restoring

Stop the server first, then:

```bash
scripts/restore.sh backups/neoams-20261118-120000 apps/api/neoams.sqlite
```

The database that was replaced is kept as `neoams.sqlite.before-restore`, so
a bad restore can be undone.

### A nightly backup

```cron
15 2 * * * cd /opt/neoams && scripts/backup.sh apps/api/neoams.sqlite >> /var/log/neoams-backup.log 2>&1
```

Keep the copies off the server. A backup on the same disk as the database
does not survive the disk.

---

## Upgrading

```bash
git pull
docker compose up -d --build
```

The schema is brought up to date on start. Take a backup first: a migration
and a rollback are not the same thing.

---

## What to check after an install

- [ ] `GET /api/v1/setup/status` answers `{"needsSetup":false,...}`
- [ ] `https://your-domain/` shows the sign-in page
- [ ] `https://your-domain/reference/` shows the API reference
- [ ] You can sign in and change your password
- [ ] The first backup was taken and can be restored
