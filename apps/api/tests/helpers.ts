// tests/helpers.ts
// Shared test harness: a throwaway database with the real schema applied,
// an app instance built from it, and helpers for authenticated requests.
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { createContainer } from "../src/container";
import { createDb, type Db } from "../src/db";
import type { Env } from "../src/env";
import { properties, roomTypes, rooms, propertyStaff } from "../src/db/schema";
import { user, account } from "../src/db/schema/auth";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "drizzle");

/** Apply every migration file, in order, to a fresh SQLite file. */
export function migrate(file: string): void {
  const sqlite = new Database(file);
  // Migrations are pure DDL, so durability during the replay does not matter.
  // Without this every statement costs an fsync and the suite crawls.
  sqlite.run("PRAGMA journal_mode = MEMORY");
  sqlite.run("PRAGMA synchronous = OFF");
  const dirs = readdirSync(MIGRATIONS_DIR)
    .filter((d) => !d.endsWith(".json"))
    .sort();
  sqlite.run("BEGIN");
  try {
    for (const dir of dirs) {
      const sql = readFileSync(
        join(MIGRATIONS_DIR, dir, "migration.sql"),
        "utf8",
      );
      for (const statement of sql.split("--> statement-breakpoint")) {
        const trimmed = statement.trim();
        if (trimmed) sqlite.run(trimmed);
      }
    }
    sqlite.run("COMMIT");
  } catch (err) {
    sqlite.run("ROLLBACK");
    throw err;
  }
  sqlite.close();
}

/**
 * A migrated database, built once per test process and copied for each test.
 * Replaying the migrations per test would cost seconds every time.
 */
let template: string | null = null;
function getTemplate(): string {
  if (template) return template;
  const file = `/tmp/opencode/neoams-template-${process.pid}.sqlite`;
  try {
    require("node:fs").unlinkSync(file);
  } catch {
    /* first run */
  }
  migrate(file);
  template = file;
  return file;
}

export type TestCtx = {
  app: FastifyInstance;
  db: Db;
  env: Env;
  auth: ReturnType<typeof createContainer>["auth"];
  /** The whole container, so a test can reach a service directly. */
  container: ReturnType<typeof createContainer>;
  services: ReturnType<typeof createContainer>["services"];
  close: () => Promise<void>;
  file: string;
};

let counter = 0;

/** A fresh database + app. Call `close()` in afterAll. */
export function createTestCtx(overrides: Partial<Env> = {}): TestCtx {
  counter += 1;
  const file = `/tmp/opencode/neoams-test-${process.pid}-${counter}.sqlite`;
  try {
    require("node:fs").unlinkSync(file);
  } catch {
    /* first run */
  }
  // Start from the migrated template instead of replaying the migrations.
  require("node:fs").copyFileSync(getTemplate(), file);

  const env = {
    DB_FILE_NAME: file,
    FRONTEND_URL: "http://localhost:5173",
    BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
    BETTER_AUTH_URL: "http://localhost:3000",
    PORT: 3000,
    TRUST_PROXY: false,
    BOOKING_HOLD_MINUTES: 120,
    PROOF_HOLD_HOURS: 24,
    UPLOAD_DIR: "/tmp/opencode/neoams-uploads",
    MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
    // The suite signs in far more often than any person would, so the
    // sign-in rate limit is off by default here. The suite that tests the
    // limit itself turns it on.
    RATE_LIMIT_ENABLED: false,
    RATE_LIMIT_SIGN_IN_MAX: 10,
    ...overrides,
  } as Env;

  const container = createContainer(env, createDb(file));
  const app = buildApp(container);
  return {
    app,
    db: container.db,
    auth: container.auth,
    container,
    services: container.services,
    env,
    file,
    close: async () => {
      await app.close();
    },
  };
}

/** Create a user with a password, mirroring what the admin plugin does. */
export async function createUser(
  ctx: TestCtx,
  opts: {
    email: string;
    password?: string;
    name?: string;
    role?: "admin" | "user";
    mustChangePassword?: boolean;
  },
): Promise<{ id: string; email: string; role: string }> {
  const password = opts.password ?? "Test1234#!";
  const authCtx = await ctx.auth.$context;
  const created = await ctx.auth.api.createUser({
    body: {
      email: opts.email,
      password,
      name: opts.name ?? "Test User",
      role: opts.role ?? "user",
    },
  });
  const id = created.user.id;
  if (opts.mustChangePassword) {
    ctx.db.update(user).set({ mustChangePassword: true }).where(eqId(id)).run();
  }
  return { id, email: opts.email, role: opts.role ?? "user" };
}

// drizzle's eq() needs the column; this keeps the helper readable.
function eqId(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { eq } = require("drizzle-orm");
  return eq(user.id, id);
}

/** Sign in and return the session cookie header value. */
export async function signIn(
  ctx: TestCtx,
  email: string,
  password = "Test1234#!",
): Promise<string> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    headers: { "content-type": "application/json" },
    payload: { email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(
      `sign-in failed for ${email}: ${res.statusCode} ${res.body}`,
    );
  }
  const setCookie = res.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const session = cookies.find((c) =>
    c?.startsWith("better-auth.session_token="),
  );
  if (!session) throw new Error(`no session cookie for ${email}`);
  return session.split(";")[0]!;
}

/** A property with one room type and two rooms, ready for bookings. */
export function seedProperty(ctx: TestCtx, name = "Test Lodge") {
  const property = ctx.db
    .insert(properties)
    .values({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      county: "Nairobi",
      town: "Nairobi",
      checkInTime: "14:00",
      checkOutTime: "10:00",
      depositPercent: 30,
    })
    .returning()
    .get();

  const rt = ctx.db
    .insert(roomTypes)
    .values({
      propertyId: property.id,
      name: "Standard Room",
      slug: "standard-room",
      pricePerNightCents: 100_000,
      pricePerHourCents: 20_000,
      maxOccupancy: 2,
    })
    .returning()
    .get();

  const room = ctx.db
    .insert(rooms)
    .values({
      propertyId: property.id,
      roomTypeId: rt.id,
      roomNumber: "101",
      floor: "Ground",
    })
    .returning()
    .get();

  return { property, roomType: rt, room };
}

/** Attach a user to a property with a role. */
export function assignStaff(
  ctx: TestCtx,
  propertyId: number,
  userId: string,
  role: "owner" | "manager" | "receptionist" | "accountant" | "staff",
) {
  return ctx.db
    .insert(propertyStaff)
    .values({ propertyId, userId, role })
    .returning()
    .get();
}

/** Helper to build an authenticated inject request. */
export function authed(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  cookie: string,
  payload?: unknown,
) {
  return {
    method,
    url,
    headers: {
      cookie,
      ...(payload !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(payload !== undefined ? { payload } : {}),
  };
}

export { account, user };
