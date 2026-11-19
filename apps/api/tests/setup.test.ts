// tests/setup.test.ts
// First-run installation: status, token protection, the race, and the lock.
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { isUniqueViolation } from "../src/core/errors";
import { createTestCtx, type TestCtx } from "./helpers";

describe("first-run setup", () => {
  let ctx: TestCtx;

  beforeEach(() => {
    ctx = createTestCtx();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("reports that setup is needed on a fresh install", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/setup/status",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ needsSetup: true, setupTokenRequired: false });
  });

  it("creates the first administrator", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: {
        name: "First Admin",
        email: "first@example.com",
        password: "FirstPass1234!",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe("first@example.com");
    expect(body.user.role).toBe("admin");
  });

  it("locks the installation once it is done", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: {
        name: "First Admin",
        email: "first@example.com",
        password: "FirstPass1234!",
      },
    });

    const second = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: {
        name: "Second Admin",
        email: "second@example.com",
        password: "SecondPass1234!",
      },
    });
    expect(second.statusCode).toBe(403);
    expect(second.json().error.code).toBe("SETUP_COMPLETE");
  });

  it("reports that setup is done afterwards", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: {
        name: "First Admin",
        email: "first@example.com",
        password: "FirstPass1234!",
      },
    });
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/setup/status",
    });
    expect(res.json().needsSetup).toBe(false);
  });

  it("lets exactly one of two concurrent callers win", async () => {
    const payload = (email: string) => ({
      method: "POST" as const,
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: { name: "Racer", email, password: "RacePass1234!" },
    });

    const [a, b] = await Promise.all([
      ctx.app.inject(payload("race-a@example.com")),
      ctx.app.inject(payload("race-b@example.com")),
    ]);

    const statuses = [a.statusCode, b.statusCode].sort();
    expect(statuses).toEqual([201, 403]);

    // And only one administrator exists.
    const admins = ctx.db
      .select()
      .from((await import("../src/db/schema/auth")).user)
      .all()
      .filter((u) => u.role === "admin");
    expect(admins.length).toBe(1);
  });

  it("rejects a weak password", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: { name: "X", email: "x@example.com", password: "short" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a malformed email", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: { name: "X", email: "not-an-email", password: "GoodPass1234!" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("puts a request id on every error body", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: { name: "X", email: "bad", password: "GoodPass1234!" },
    });
    expect(res.json().error.requestId).toBeString();
  });

  it("does not disguise a broken database as a completed setup", async () => {
    // The claim is written to app_settings. If that table is missing, the
    // failure is a real fault and must be reported as one, not as
    // "setup has already been completed".
    ctx.db.$client.run("DROP TABLE app_settings");

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: {
        name: "First Admin",
        email: "first@example.com",
        password: "FirstPass1234!",
      },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe("INTERNAL");
    expect(res.json().error.code).not.toBe("SETUP_COMPLETE");
  });
});

describe("telling a unique violation apart from other failures", () => {
  it("recognises a unique constraint", () => {
    expect(isUniqueViolation({ code: "SQLITE_CONSTRAINT_UNIQUE" })).toBe(true);
    expect(
      isUniqueViolation({
        message: "UNIQUE constraint failed: app_settings.id",
      }),
    ).toBe(true);
    // Drizzle wraps the driver error, so the cause has to be followed.
    expect(
      isUniqueViolation({
        message: "Failed query: insert into app_settings ...",
        cause: { code: "SQLITE_CONSTRAINT_UNIQUE" },
      }),
    ).toBe(true);
  });

  it("does not mistake another failure for one", () => {
    expect(isUniqueViolation({ code: "SQLITE_ERROR" })).toBe(false);
    expect(isUniqueViolation(new Error("no such table: app_settings"))).toBe(
      false,
    );
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

describe("first-run setup with a token", () => {
  let ctx: TestCtx;

  beforeEach(() => {
    ctx = createTestCtx({ SETUP_TOKEN: "s3cret-token" });
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("says a token is required", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/setup/status",
    });
    expect(res.json().setupTokenRequired).toBe(true);
  });

  it("refuses a setup without the token", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: {
        name: "First",
        email: "first@example.com",
        password: "FirstPass1234!",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_SETUP_TOKEN");
  });

  it("refuses a setup with the wrong token", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: {
        name: "First",
        email: "first@example.com",
        password: "FirstPass1234!",
        setupToken: "wrong",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_SETUP_TOKEN");
  });

  it("accepts a setup with the right token", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/setup",
      headers: { "content-type": "application/json" },
      payload: {
        name: "First",
        email: "first@example.com",
        password: "FirstPass1234!",
        setupToken: "s3cret-token",
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("public sign-up is closed", () => {
  let ctx: TestCtx;

  beforeEach(() => {
    ctx = createTestCtx();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("does not let the world create an account", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { "content-type": "application/json" },
      payload: {
        email: "intruder@example.com",
        password: "Intruder1234!",
        name: "Intruder",
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
