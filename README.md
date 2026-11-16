# NeoAMS (Accommodation Management System That Works)

A high-performance property management and booking engine for Bed & Breakfasts (BnBs), boutique hotels, and guesthouses. Built with **Bun**, **Fastify**, **Better Auth**, and **Drizzle ORM** (backed by SQLite with WAL mode).

---

## Features

- **Multi-Property & Staff Access Control**:
  - Global `admin` and `user` accounts with property-specific roles (`owner`, `manager`, `receptionist`, `accountant`, `staff`).
  - Granular permission matrix (`booking:read`, `booking:write`, `guest:read`, `guest:write`, `billing:read`, `billing:record`, etc.).
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

---

## Architecture & Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **HTTP Server**: [Fastify 5](https://fastify.dev) with CORS and Rate Limiting
- **Authentication**: [Better Auth](https://www.better-auth.com) with Drizzle adapter
- **Database / ORM**: SQLite (`bun:sqlite` with WAL mode & PRAGMA foreign keys) managed by [Drizzle ORM](https://orm.drizzle.team)
- **Validation**: [Superstruct](https://docs.superstructjs.org) for runtime schema and request validation

---

## Directory Structure

```bash
src/
├── app.ts                 # Fastify app factory, CORS, hooks & route registration
├── auth.ts                # Better Auth configuration & adapter setup
├── container.ts           # Dependency injection container & service initialization
├── env.ts                 # Environment validation (Superstruct)
├── server.ts              # Entrypoint & background housekeeping intervals
├── core/                  # Pure domain logic (actors, clock, errors, permissions, stay pricing)
├── db/
│   ├── index.ts           # Database connection & Conn/Tx typings
│   ├── enums.ts           # Domain enums (roles, booking statuses, payment methods)
│   ├── relations.ts       # Drizzle relational mappings
│   ├── schema/            # Domain-driven modular schema tables
│   └── seed.ts            # Database seeder (admin, property, room types, rooms, payment options)
├── http/                  # HTTP guards, error handlers, and route dependencies
├── routes/
│   ├── auth.ts            # Better Auth catch-all endpoint (/api/auth/*)
│   ├── me.ts              # Current session, profile, and guest history (/api/v1/me)
│   ├── public/            # Public guest booking & availability endpoints (/api/v1/public/*)
│   └── staff/             # Property-scoped staff routes (/api/v1/properties/:propertyId/*)
├── services/              # Transaction-safe business services (booking, billing, guest, availability)
└── validation/            # Superstruct schemas for request payloads and query params
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.4+ installed.

### 1. Environment Setup

Copy `.env.example` to `.env` and configure your settings:

```bash
cp .env.example .env
```

Example `.env`:

```env
DB_FILE_NAME=neoams.sqlite
BETTER_AUTH_SECRET=your-32-characters-secret-key-change-this-in-prod
BETTER_AUTH_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
PORT=3000
TRUST_PROXY=false
BOOKING_HOLD_MINUTES=120
PROOF_HOLD_HOURS=24
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Database Migrations & Seeding

Generate / push migrations and seed the initial dataset:

```bash
# Generate SQL migrations
bun run db:generate

# Apply migrations
bun run db:migrate

# Seed demo property, room types, rooms, payment options, and admin/manager accounts
bun src/db/seed.ts
```

> **Default Seed Accounts:**
>
> - **Admin**: `admin@neoams.com` / `Admin1234#` (Global Admin & Property Owner)
> - **Manager**: `manager@safarihaven.co.ke` / `Manager1234#` (Property Manager)

### 4. Running the Server

Start in development mode with auto-reload:

```bash
bun run dev
```

Or start in production mode:

```bash
bun run start
```

---

## API Documentation

Interactive API documentation powered by **Scalar** is available at:

```
http://localhost:3000/reference
```

---

## API Overview

| Route | Method | Description | Access |
| :--- | :--- | :--- | :--- |
| `/api/auth/*` | `GET`, `POST` | Better Auth endpoints (sign-in, sign-up, sign-out) | Public |
| `/api/v1/me` | `GET` | Get authenticated user info & accessible properties | Authenticated |
| `/api/v1/me/guest` | `GET`, `PUT` | View or update guest profile | Authenticated |
| `/api/v1/me/bookings` | `GET` | View booking history for authenticated user | Authenticated |
| `/api/v1/public/properties/:slug/availability` | `GET` | Check room availability & pricing for stay dates | Public |
| `/api/v1/public/properties/:slug/bookings` | `POST` | Create online booking with provisional hold | Public / User |
| `/api/v1/public/bookings/:reference` | `GET` | View booking summary (by reference + phone/session) | Public / Guest |
| `/api/v1/public/bookings/:reference/proof` | `POST` | Submit payment confirmation / proof message | Public / Guest |
| `/api/v1/public/bookings/:reference/cancel` | `POST` | Self-service cancellation | Public / Guest |
| `/api/v1/properties/:propertyId/bookings` | `GET`, `POST` | List property bookings or create desk reservation | Staff (`booking:read` / `booking:write`) |
| `/api/v1/properties/:propertyId/bookings/:id` | `GET` | Detailed booking view | Staff (`booking:read`) |
| `/api/v1/properties/:propertyId/bookings/:id/:transition` | `POST` | Execute status transition (`confirm`, `checkIn`, `checkOut`, `noShow`, `cancel`) | Staff (`booking:transition`) |
| `/api/v1/properties/:propertyId/guests` | `GET`, `POST` | Search guests or find/create guest record | Staff (`guest:read` / `guest:write`) |
| `/api/v1/properties/:propertyId/payments` | `POST` | Record payment, deposit, or refund | Staff (`billing:record`) |
| `/api/v1/properties/:propertyId/payments/:id/review` | `POST` | Verify or reject guest-submitted payment proof | Staff (`billing:review`) |

---

## Scripts

- `bun run dev`: Runs the Fastify server with hot reload.
- `bun run start`: Runs the server in production mode.
- `bun run db:generate`: Generates Drizzle migration files based on schema changes.
- `bun run db:migrate`: Runs pending SQLite migrations.
- `bun run db:studio`: Opens Drizzle Studio GUI for exploring the database.
- `bun x tsc --noEmit`: Typechecks the entire TypeScript codebase.
