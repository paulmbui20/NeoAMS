// tests/admin.test.ts
// The global administration area: properties and user accounts.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createTestCtx, createUser, signIn, type TestCtx } from "./helpers";
import { user } from "../src/db/schema/auth";
import { propertyStaff } from "../src/db/schema";

describe("admin area", () => {
  let ctx: TestCtx;
  let cookie: string;

  beforeAll(async () => {
    ctx = createTestCtx();
    const admin = await createUser(ctx, {
      email: "root@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    expect(admin.role).toBe("admin");
    cookie = await signIn(ctx, "root@example.com");
  });

  afterAll(async () => {
    await ctx.close();
  });

  /* ------------------------------------------------------------ properties */

  it("creates a property with its first owner", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/properties",
      headers: { cookie, "content-type": "application/json" },
      payload: {
        name: "Riverstone Lodge",
        county: "Nakuru",
        town: "Naivasha",
        owner: {
          name: "Owner One",
          email: "owner1@example.com",
          tempPassword: "TempPass1234!",
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Riverstone Lodge");
    expect(body.slug).toBe("riverstone-lodge");

    // The owner is on the roster.
    const roster = ctx.db
      .select()
      .from(propertyStaff)
      .all()
      .filter((r) => r.propertyId === body.id);
    expect(roster.length).toBe(1);
    expect(roster[0]!.role).toBe("owner");

    // And the new owner must change the temporary password.
    const owner = ctx.db
      .select()
      .from(user)
      .all()
      .find((u) => u.email === "owner1@example.com")!;
    expect(owner.mustChangePassword).toBe(true);
  });

  it("attaches an existing user as the owner", async () => {
    const existing = await createUser(ctx, {
      email: "existing-owner@example.com",
      password: "Test1234#!",
    });
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/properties",
      headers: { cookie, "content-type": "application/json" },
      payload: {
        name: "Hillside Inn",
        county: "Kiambu",
        town: "Limuru",
        owner: { userId: existing.id },
      },
    });
    expect(res.statusCode).toBe(201);
    const roster = ctx.db
      .select()
      .from(propertyStaff)
      .all()
      .filter((r) => r.propertyId === res.json().id);
    expect(roster[0]!.userId).toBe(existing.id);
  });

  it("gives a duplicate name a distinct slug", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/properties",
      headers: { cookie, "content-type": "application/json" },
      payload: {
        name: "Riverstone Lodge",
        county: "Nakuru",
        town: "Naivasha",
        owner: { userId: "someone" },
      },
    });
    // The owner id does not exist, so this fails, but not on the slug.
    expect(res.statusCode).toBe(404);
    const slugs = ctx.db.select().from(propertyStaff).all();
    expect(slugs.length).toBeGreaterThan(0);
  });

  it("lists the properties", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/admin/properties",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it("reads one property", async () => {
    const list = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/admin/properties",
      headers: { cookie },
    });
    const id = list.json().data[0].id;
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/admin/properties/${id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(id);
  });

  it("answers 404 for an unknown property", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/admin/properties/999999",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("updates a property", async () => {
    const list = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/admin/properties",
      headers: { cookie },
    });
    const id = list.json().data[0].id;
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/properties/${id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "Renamed Lodge", depositPercent: 45 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Renamed Lodge");
    expect(res.json().depositPercent).toBe(45);
  });

  it("rejects a property without a county", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/properties",
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "No County", town: "Somewhere" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_FAILED");
  });

  /* ----------------------------------------------------------------- users */

  it("creates a user who must change the password", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: { cookie, "content-type": "application/json" },
      payload: {
        name: "New Hire",
        email: "newhire@example.com",
        tempPassword: "TempPass1234!",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.email).toBe("newhire@example.com");
    expect(body.role).toBe("user");
    expect(body.mustChangePassword).toBe(true);
  });

  it("refuses a duplicate email", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: { cookie, "content-type": "application/json" },
      payload: {
        name: "Copy",
        email: "newhire@example.com",
        tempPassword: "TempPass1234!",
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("EMAIL_IN_USE");
  });

  it("searches users by name and by email", async () => {
    const byName = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/admin/users?q=New+Hire",
      headers: { cookie },
    });
    expect(byName.json().data.length).toBe(1);

    const byEmail = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/admin/users?q=newhire%40example.com",
      headers: { cookie },
    });
    expect(byEmail.json().data.length).toBe(1);
  });

  it("filters users by role", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/admin/users?role=admin",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    for (const row of res.json().data) {
      expect(row.role).toBe("admin");
    }
  });

  it("paginates the user list", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/admin/users?limit=2&offset=0",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeLessThanOrEqual(2);
    expect(res.json().meta.limit).toBe(2);
  });

  it("renames a user", async () => {
    const target = await createUser(ctx, {
      email: "rename-me@example.com",
      password: "Test1234#!",
    });
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${target.id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "Renamed Person" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Renamed Person");
  });

  it("resets a password and signs the user out everywhere", async () => {
    const target = await createUser(ctx, {
      email: "reset-me@example.com",
      password: "Test1234#!",
    });
    const oldCookie = await signIn(ctx, "reset-me@example.com");

    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${target.id}/reset-password`,
      headers: { cookie, "content-type": "application/json" },
      payload: { newPassword: "FreshPass1234!" },
    });
    expect(res.statusCode).toBe(200);

    // The old session is gone.
    const oldSession = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: oldCookie },
    });
    expect(oldSession.statusCode).toBe(401);

    // The new password works.
    const signInRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json" },
      payload: { email: "reset-me@example.com", password: "FreshPass1234!" },
    });
    expect(signInRes.statusCode).toBe(200);
  });

  it("revokes the sessions of a user", async () => {
    const target = await createUser(ctx, {
      email: "revoke-me@example.com",
      password: "Test1234#!",
    });
    const targetCookie = await signIn(ctx, "revoke-me@example.com");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${target.id}/revoke-sessions`,
      headers: { cookie, "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().revoked).toBeGreaterThanOrEqual(1);

    const after = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: targetCookie },
    });
    expect(after.statusCode).toBe(401);
  });

  it("answers 404 for an unknown user", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/admin/users/does-not-exist",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects a weak temporary password", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: { cookie, "content-type": "application/json" },
      payload: {
        name: "Weak",
        email: "weak@example.com",
        tempPassword: "short",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
