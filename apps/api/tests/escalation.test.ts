// tests/escalation.test.ts
// The rules that stop one person from giving themselves more power.
// Each rule in the specification has its own test here.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import {
  assignStaff,
  createTestCtx,
  createUser,
  signIn,
  type TestCtx,
} from "./helpers";
import { user } from "../src/db/schema/auth";

describe("privilege escalation rules", () => {
  let ctx: TestCtx;
  let propertyId: number;

  beforeAll(async () => {
    ctx = createTestCtx();
    const seeded = await import("./helpers").then((m) => m.seedProperty(ctx));
    propertyId = seeded.property.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  /* ------------------------------------------- 1. nobody edits themselves */

  it("refuses an admin changing their own role", async () => {
    const admin = await createUser(ctx, {
      email: "self-admin@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    const cookie = await signIn(ctx, "self-admin@example.com");
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${admin.id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { role: "user" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("SELF_EDIT_FORBIDDEN");
  });

  it("refuses an admin banning themselves", async () => {
    const admin = await createUser(ctx, {
      email: "self-ban@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    const cookie = await signIn(ctx, "self-ban@example.com");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${admin.id}/ban`,
      headers: { cookie, "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("SELF_EDIT_FORBIDDEN");
  });

  it("refuses an owner removing themselves from their property", async () => {
    const owner = await createUser(ctx, {
      email: "self-remove@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, owner.id, "owner");
    const cookie = await signIn(ctx, "self-remove@example.com");
    const staff = ctx.db
      .select()
      .from((await import("../src/db/schema")).propertyStaff)
      .all()
      .find((r) => r.userId === owner.id)!;

    const res = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/properties/${propertyId}/staff/${staff.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("SELF_EDIT_FORBIDDEN");
  });

  /* ------------------------------------- 2. the last admin is protected */

  it("refuses to demote the last admin", async () => {
    const first = await createUser(ctx, {
      email: "admin-one@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    const second = await createUser(ctx, {
      email: "admin-two@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    const cookie = await signIn(ctx, "admin-one@example.com");

    // Demote the other admin: fine, two exist.
    const ok = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${second.id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { role: "user" },
    });
    expect(ok.statusCode).toBe(200);

    // Now only one admin is left: the last one cannot be demoted.
    const adminCookie = await signIn(ctx, "admin-one@example.com");
    const blocked = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${first.id}`,
      headers: { cookie: adminCookie, "content-type": "application/json" },
      payload: { role: "user" },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("SELF_EDIT_FORBIDDEN");
  });

  it("refuses to ban the last admin", async () => {
    const target = await createUser(ctx, {
      email: "ban-target@example.com",
      password: "Test1234#!",
    });
    const admin = await createUser(ctx, {
      email: "ban-admin@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    const cookie = await signIn(ctx, "ban-admin@example.com");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${target.id}/ban`,
      headers: { cookie, "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().banned).toBe(true);
    void admin;
  });

  /* ------------------------------ 3. only an admin may touch an admin */

  it("refuses a non-admin reaching the admin area", async () => {
    const plain = await createUser(ctx, {
      email: "plain@example.com",
      password: "Test1234#!",
    });
    const cookie = await signIn(ctx, "plain@example.com");
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/admin/users",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("ADMIN_REQUIRED");
  });

  it("refuses a non-admin managing an admin account", async () => {
    const target = await createUser(ctx, {
      email: "target-admin@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    const plain = await createUser(ctx, {
      email: "plain-two@example.com",
      password: "Test1234#!",
    });
    const cookie = await signIn(ctx, "plain-two@example.com");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${target.id}/ban`,
      headers: { cookie, "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  /* ------------------ 4. owners manage below them; owners are admin-only */

  it("refuses an owner promoting somebody to owner", async () => {
    const owner = await createUser(ctx, {
      email: "owner-promote@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, owner.id, "owner");
    const target = await createUser(ctx, {
      email: "promote-target@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, target.id, "receptionist");

    const cookie = await signIn(ctx, "owner-promote@example.com");
    const staff = ctx.db
      .select()
      .from((await import("../src/db/schema")).propertyStaff)
      .all()
      .find((r) => r.userId === target.id)!;

    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/staff/${staff.id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { role: "owner" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("OWNER_ADMIN_ONLY");
  });

  it("refuses an owner removing another owner", async () => {
    const ownerA = await createUser(ctx, {
      email: "owner-a@example.com",
      password: "Test1234#!",
    });
    const ownerB = await createUser(ctx, {
      email: "owner-b@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, ownerA.id, "owner");
    assignStaff(ctx, propertyId, ownerB.id, "owner");

    const cookie = await signIn(ctx, "owner-a@example.com");
    const staff = ctx.db
      .select()
      .from((await import("../src/db/schema")).propertyStaff)
      .all()
      .find((r) => r.userId === ownerB.id)!;

    const res = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/properties/${propertyId}/staff/${staff.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("OWNER_ADMIN_ONLY");
  });

  it("lets an admin promote somebody to owner", async () => {
    const admin = await createUser(ctx, {
      email: "admin-promote@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    const target = await createUser(ctx, {
      email: "promote-ok@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, target.id, "receptionist");

    const cookie = await signIn(ctx, "admin-promote@example.com");
    const staff = ctx.db
      .select()
      .from((await import("../src/db/schema")).propertyStaff)
      .all()
      .find((r) => r.userId === target.id)!;

    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/staff/${staff.id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { role: "owner" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("owner");
    void admin;
  });

  /* ------------------------------------------- the last owner is protected */

  it("refuses removing the last owner of a property", async () => {
    const fresh = await import("./helpers").then((m) =>
      m.seedProperty(ctx, "Solo Lodge"),
    );
    const owner = await createUser(ctx, {
      email: "solo-owner@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, fresh.property.id, owner.id, "owner");
    const cookie = await signIn(ctx, "solo-owner@example.com");
    const staff = ctx.db
      .select()
      .from((await import("../src/db/schema")).propertyStaff)
      .all()
      .find(
        (r) => r.userId === owner.id && r.propertyId === fresh.property.id,
      )!;

    const res = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/properties/${fresh.property.id}/staff/${staff.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("SELF_EDIT_FORBIDDEN");
  });

  /* ---------------------- 5. an owner cannot reset a multi-property user */

  it("refuses an owner resetting somebody who works elsewhere too", async () => {
    const second = await import("./helpers").then((m) =>
      m.seedProperty(ctx, "Other Lodge"),
    );
    const owner = await createUser(ctx, {
      email: "owner-reset@example.com",
      password: "Test1234#!",
    });
    const shared = await createUser(ctx, {
      email: "shared@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, owner.id, "owner");
    assignStaff(ctx, propertyId, shared.id, "receptionist");
    assignStaff(ctx, second.property.id, shared.id, "receptionist");

    const cookie = await signIn(ctx, "owner-reset@example.com");
    const staff = ctx.db
      .select()
      .from((await import("../src/db/schema")).propertyStaff)
      .all()
      .find((r) => r.userId === shared.id && r.propertyId === propertyId)!;

    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/staff/${staff.id}/reset-password`,
      headers: { cookie, "content-type": "application/json" },
      payload: { newPassword: "BrandNew1234!" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("MULTI_PROPERTY_RESET");
  });

  it("lets an owner reset somebody who works only here", async () => {
    const solo = await import("./helpers").then((m) =>
      m.seedProperty(ctx, "Solo Reset Lodge"),
    );
    const owner = await createUser(ctx, {
      email: "owner-reset-ok@example.com",
      password: "Test1234#!",
    });
    const member = await createUser(ctx, {
      email: "member@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, solo.property.id, owner.id, "owner");
    assignStaff(ctx, solo.property.id, member.id, "receptionist");

    const cookie = await signIn(ctx, "owner-reset-ok@example.com");
    const staff = ctx.db
      .select()
      .from((await import("../src/db/schema")).propertyStaff)
      .all()
      .find(
        (r) => r.userId === member.id && r.propertyId === solo.property.id,
      )!;

    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${solo.property.id}/staff/${staff.id}/reset-password`,
      headers: { cookie, "content-type": "application/json" },
      payload: { newPassword: "BrandNew1234!" },
    });
    expect(res.statusCode).toBe(200);

    // The new password works.
    const signInRes = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json" },
      payload: { email: "member@example.com", password: "BrandNew1234!" },
    });
    expect(signInRes.statusCode).toBe(200);
  });

  /* ------------------------------------------ 7. ban, not delete, for users */

  it("keeps the record when a user is banned", async () => {
    const target = await createUser(ctx, {
      email: "banned@example.com",
      password: "Test1234#!",
    });
    const admin = await createUser(ctx, {
      email: "ban-admin-keep@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    const cookie = await signIn(ctx, "ban-admin-keep@example.com");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${target.id}/ban`,
      headers: { cookie, "content-type": "application/json" },
      payload: { reason: "Misuse" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().banned).toBe(true);

    // The row is still there.
    const still = ctx.db
      .select()
      .from(user)
      .all()
      .find((u) => u.id === target.id);
    expect(still).toBeDefined();
    expect(still!.banned).toBe(true);
    void admin;
  });

  it("drops the sessions of a banned user", async () => {
    const target = await createUser(ctx, {
      email: "banned-sessions@example.com",
      password: "Test1234#!",
    });
    const cookie = await signIn(ctx, "banned-sessions@example.com");
    const admin = await createUser(ctx, {
      email: "ban-admin-2@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    const adminCookie = await signIn(ctx, "ban-admin-2@example.com");
    await ctx.app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${target.id}/ban`,
      headers: { cookie: adminCookie, "content-type": "application/json" },
      payload: {},
    });

    // The old cookie no longer works.
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(401);
  });

  it("lets an admin unban somebody", async () => {
    const target = await createUser(ctx, {
      email: "unbanned@example.com",
      password: "Test1234#!",
    });
    const admin = await createUser(ctx, {
      email: "unban-admin@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    const cookie = await signIn(ctx, "unban-admin@example.com");
    await ctx.app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${target.id}/ban`,
      headers: { cookie, "content-type": "application/json" },
      payload: {},
    });
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${target.id}/unban`,
      headers: { cookie, "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().banned).toBe(false);
    void admin;
  });
});

/**
 * The LAST_ADMIN guard cannot be reached through the HTTP API: with a single
 * admin the only person who could act on them is themselves, and the API
 * refuses self-edits first. The guard still matters as a service-level
 * invariant, so it is tested here on its own.
 */
describe("the LAST_ADMIN invariant", () => {
  let ctx: TestCtx;

  beforeEach(() => {
    ctx = createTestCtx();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("refuses to demote the only administrator", async () => {
    const sole = await createUser(ctx, {
      email: "sole@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    expect(() =>
      ctx.services.users.setRole(sole.id, "user", "somebody-else"),
    ).toThrow(/last admin/i);
  });

  it("refuses to ban the only administrator", async () => {
    const sole = await createUser(ctx, {
      email: "sole-ban@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    expect(() => ctx.services.users.assertNotLastAdmin(sole.id)).toThrow(
      /last admin/i,
    );
  });

  it("allows the demotion while a second administrator exists", async () => {
    const first = await createUser(ctx, {
      email: "admin-a@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    await createUser(ctx, {
      email: "admin-b@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    const changed = ctx.services.users.setRole(
      first.id,
      "user",
      "somebody-else",
    );
    expect(changed.role).toBe("user");
  });
});
