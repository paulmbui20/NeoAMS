# NeoAMS (Accommodation Management System That Works)

A high-performance property management and booking engine for Bed & Breakfasts (BnBs), boutique hotels, and guesthouses. Built with **Bun**, **Fastify**, **Better Auth**, and **Drizzle ORM** (backed by SQLite with WAL mode), with a **SvelteKit** interface.

---

## Features

- **Multi-Property & Staff Access Control**:
  - Global `admin` and `user` accounts with property-specific roles (`owner`, `manager`, `receptionist`, `accountant`, `staff`).
  - Granular permission matrix (`booking:read`, `booking:write`, `guest:read`, `guest:write`, `payment:write`, `expense:manage`, `report:read`, `audit:read`, …), defined once in `packages/shared` and used by both the API and the interface.
  - Horizontal management: an owner may manage accounts and roles _below_ their own level, but never an administrator.
- **Dynamic Availability Engine**:
  - Live, date-range availability calculations preventing overbooking without static room-count counters.
  - Automatic expiry handling for unpaid online holds (`BOOKING_HOLD_MINUTES` / `PROOF_HOLD_HOURS`).
- **Hospitality & Booking Lifecycle**:
  - Reservation state machine: `pending` → `confirmed` → `checked_in` → `checked_out` / `cancelled` / `no_show`.
  - Nightly and hourly rate resolution with stay-duration and capacity validations.
  - Support for walk-ins, phone reservations, and public online bookings.
- **Billing & Money Ledger**:
  - Multi-method payments (M-Pesa Till / Paybill, card, cash, bank transfer) and payment verification.
  - Payment proof uploads for manual / semi-automated reconciliation.
  - Standardized monetary values tracked strictly in minor units (`_cents`).
- **Desk & Guest Management**:
  - Safe guest identity deduplication and profile retrieval.
  - Transaction-safe `findOrCreateOne` guest workflows.
- **Audit Logging**:
  - Structured audit trail capturing actor, entity, and state changes across billing and reservations.
- **Security**:
  - Session cookies, a forced password change for every account that was created with a temporary one.
  - A sign-in rate limit, and an origin check that refuses a write from another site.
  - Uploads are identified by their bytes, not by their name or their headers.

---

## Architecture & Tech Stack

- **Runtime**: [Bun](https://bun.sh) for the API and the toolchain; **Node.js** for the production web build (the `adapter-node` output).
- **HTTP Server**: [Fastify 5](https://fastify.dev) with CORS, Rate Limiting, Multipart and Swagger.
- **Authentication**: [Better Auth](https://www.better-auth.com) with the admin plugin and a Drizzle adapter.
- **Database / ORM**: SQLite (`bun:sqlite` with WAL mode & PRAGMA foreign keys) managed by [Drizzle ORM](https://orm.drizzle.team).
- **Validation**: [Superstruct](https://docs.superstructjs.org) for runtime schema and request validation, shared between the API and the browser.
- **Interface**: [SvelteKit 2](https://svelte.dev/docs/kit) with [Svelte 5](https://svelte.dev) and Tailwind CSS 4.

---

## Directory Structure

```bash
apps/
├── api/                    # the Fastify API
│   ├── src/
│   │   ├── app.ts          # app factory, CORS, hooks & route registration
│   │   ├── auth.ts         # Better Auth configuration & adapter setup
│   │   ├── container.ts    # dependency injection container & service wiring
│   │   ├── env.ts          # environment validation (Superstruct)
│   │   ├── server.ts       # entrypoint: migrate, then listen
│   │   ├── core/           # pure domain logic (errors, clock, uploads, storage)
│   │   ├── db/             # connection, schema, migrations, seed
│   │   ├── http/           # guards, error handlers, route dependencies
│   │   ├── routes/         # admin, me, public, setup, uploads, staff
│   │   └── services/       # transaction-safe business services
│   ├── tests/              # the test suite (bun test)
│   └── scripts/            # the curl sweep and its helpers
├── web/                    # the SvelteKit interface
│   └── src/
│       ├── lib/            # components, stores, the API client
│       └── routes/         # the pages
└── packages/
    └── shared/             # enums, permissions, validators, pricing, errors
deploy/
├── Caddyfile               # the production reverse proxy
└── Caddyfile.local         # the same, with a self-signed certificate
scripts/
├── backup.sh               # a consistent copy of the database and the images
└── restore.sh              # puts a backup back
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.4+ installed.

### 1. Install

```bash
bun install
```

### 2. Configure

```bash
cp .env.example .env
```

For development the defaults are right. Set a real secret:

```env
BETTER_AUTH_SECRET=<output of: openssl rand -hex 32>
```

### 3. Run

Two terminals:

```bash
bun run --filter neoams-api dev     # the API, on http://localhost:3000
bun run --filter neoams-web dev     # the interface, on http://localhost:5173
```

The schema is created automatically on the first start, so there is no
migration step to forget. Open the interface and create the first
administrator.

### Installing on a server

See **[docs/INSTALL.md](docs/INSTALL.md)**. In short:

```bash
cp .env.example .env    # then edit it
docker compose up -d --build
```

---

## The Interface

The dashboard is a SvelteKit app that talks to the API over one origin, so
the session cookie needs no special handling.

| Page               | What it is for                                                            |
| :----------------- | :------------------------------------------------------------------------ |
| `/setup`           | The first run: it creates the first administrator, and then closes.       |
| `/login`           | Signing in.                                                               |
| `/change-password` | Changing one's own password; everybody with a temporary one lands here.   |
| `/`                | Today: arrivals, departures, the people in house, and the rooms to clean. |
| `/bookings`        | The bookings of the property, searchable by reference, name or phone.     |
| `/guests`          | The guests, with the stays each of them has made.                         |
| `/rooms`           | The inventory and the state of every room; housekeeping changes it here.  |
| `/finance`         | Revenue, expenses, the payments waiting to be checked.                    |
| `/staff`           | The roster: add somebody, change a role, give a new temporary password.   |
| `/admin`           | The properties of the installation and the accounts of the people.        |

The navigation only offers what the person may actually do, so there are no
dead ends: a receptionist sees Today, Bookings, Guests and Rooms; the
administrator sees everything.

### Looking at it with data

```bash
apps/api/scripts/seed-demo.sh http://localhost:3000 you@example.com 'YourPassword123!'
```

It signs in and puts a property, some rooms, a guest, a booking, an expense
and a payment in place. It may be run more than once: what is already there
is left alone.

---

## API Documentation

Interactive API documentation powered by **Scalar** is available at:

```
http://localhost:3000/reference
```

---

## API Overview

| Route                                                     | Method         | Description                                                                         | Access                                   |
| :-------------------------------------------------------- | :------------- | :---------------------------------------------------------------------------------- | :--------------------------------------- |
| `/api/v1/setup`                                           | `GET`, `POST`  | Is the system installed? Install it.                                                | Public, once                             |
| `/api/auth/*`                                             | `GET`, `POST`  | Better Auth endpoints (sign-in, sign-out, session)                                  | Public                                   |
| `/api/v1/me`                                              | `GET`          | Get authenticated user info & accessible properties                                 | Authenticated                            |
| `/api/v1/me/guest`                                        | `GET`, `PUT`   | View or update guest profile                                                        | Authenticated                            |
| `/api/v1/me/bookings`                                     | `GET`          | View booking history for authenticated user                                         | Authenticated                            |
| `/api/v1/admin/properties`                                | `GET`, `POST`  | List or create properties                                                           | Global admin                             |
| `/api/v1/admin/users`                                     | `GET`, `POST`  | Search or create accounts                                                           | Global admin                             |
| `/api/v1/admin/users/:id`                                 | `GET`, `PATCH` | Read or change an account                                                           | Global admin                             |
| `/api/v1/public/properties/:slug/availability`            | `GET`          | Check room availability & pricing for stay dates                                    | Public                                   |
| `/api/v1/public/properties/:slug/bookings`                | `POST`         | Create online booking with provisional hold                                         | Public / User                            |
| `/api/v1/public/bookings/lookup`                          | `POST`         | View booking summary (by reference + phone)                                         | Public / Guest                           |
| `/api/v1/public/bookings/:reference/payments`             | `POST`         | Submit payment confirmation / proof message                                         | Public / Guest                           |
| `/api/v1/public/bookings/:reference/cancel`               | `POST`         | Self-service cancellation                                                           | Public / Guest                           |
| `/api/v1/properties/:propertyId`                          | `GET`, `PATCH` | Read or change the property settings                                                | Property staff                           |
| `/api/v1/properties/:propertyId/staff`                    | `GET`, `POST`  | The roster: list staff, add somebody                                                | Owner                                    |
| `/api/v1/properties/:propertyId/room-types`               | `GET`, `POST`  | The catalogue of room types                                                         | `catalog:manage`                         |
| `/api/v1/properties/:propertyId/rooms`                    | `GET`, `POST`  | The rooms                                                                           | `catalog:manage`                         |
| `/api/v1/properties/:propertyId/guests`                   | `GET`, `POST`  | Search guests or find/create guest record                                           | Staff (`guest:read` / `guest:write`)     |
| `/api/v1/properties/:propertyId/bookings`                 | `GET`, `POST`  | List property bookings or create desk reservation                                   | Staff (`booking:read` / `booking:write`) |
| `/api/v1/properties/:propertyId/bookings/:id`             | `GET`, `PATCH` | Detailed booking view, or an edit                                                   | Staff (`booking:read`)                   |
| `/api/v1/properties/:propertyId/bookings/:id/:transition` | `POST`         | Execute status transition (`confirm`, `check-in`, `check-out`, `no-show`, `cancel`) | Staff (`booking:write`)                  |
| `/api/v1/properties/:propertyId/bookings/:id/payments`    | `POST`         | Record payment, deposit, or refund                                                  | Staff (`payment:write`)                  |
| `/api/v1/properties/:propertyId/expenses`                 | `GET`, `POST`  | Record and list the expenses of the property                                        | Staff (`expense:manage`)                 |
| `/api/v1/properties/:propertyId/reports/summary`          | `GET`          | Revenue, expenses and net for a period                                              | Staff (`report:read`)                    |
| `/api/v1/properties/:propertyId/today`                    | `GET`          | Arrivals, departures, in-house and the rooms needing attention                      | Staff (`booking:read`)                   |
| `/api/v1/uploads`                                         | `POST`         | Upload an image                                                                     | Authenticated                            |

---

## Scripts

| Command                                   | What it does                                            |
| :---------------------------------------- | :------------------------------------------------------ |
| `bun run dev`                             | Runs the API and the web app together, for development. |
| `bun run test`                            | Runs the whole test suite (`bun test`).                 |
| `bun run check`                           | Typechecks every package.                               |
| `bun fmt`                                 | Formats the repository.                                 |
| `bun run --filter neoams-api db:generate` | Generates Drizzle migration files from schema changes.  |
| `bun run --filter neoams-api db:migrate`  | Runs the pending migrations.                            |
| `bun run --filter neoams-api db:studio`   | Opens Drizzle Studio for exploring the database.        |
| `apps/api/scripts/dev-server.sh`          | Starts a throwaway API for the curl sweep.              |
| `apps/api/scripts/curl-sweep.sh`          | Exercises every endpoint with curl.                     |
| `apps/api/scripts/curl-sweep-docker.sh`   | The same, against the whole Docker stack.               |
| `apps/api/scripts/seed-demo.sh`           | Puts some demo data into a running system.              |
| `scripts/backup.sh`                       | A consistent copy of the database and the images.       |
| `scripts/restore.sh`                      | Puts a backup back.                                     |
