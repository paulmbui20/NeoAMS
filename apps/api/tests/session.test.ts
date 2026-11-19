// tests/session.test.ts
// The person's own account: the session, the guest list and the password.
//
// These are the parts a person meets first, and the parts where a small
// mistake leaves somebody locked out of the system.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  assignStaff,
  createTestCtx,
  createUser,
  seedProperty,
  signIn,
  type TestCtx,
} from "./helpers";
import { user } from "../src/db/schema/auth";

/** The session cookie of a response, if there is one. */
function sessionCookie(res: { headers: Record<string, unknown> }) {
  const raw = res.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const found = cookies.find((c) =>
    String(c).startsWith("better-auth.session_token="),
  );
  return found ? String(found).split(";")[0]! : null;
}

describe("the session of a person", () => {
  let ctx: TestCtx;
  let propertyId: number;

  beforeAll(async () => {
    ctx = createTestCtx();
    const seeded = seedProperty(ctx, "Session Lodge");
    propertyId = seeded.property.id;

    // The owner reads the property; the other accounts are for the
    // password flows, which change the password and so cannot be shared.
    const owner = await createUser(ctx, {
      email: "session-owner@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, owner.id, "owner");

    await createUser(ctx, {
      email: "changer@example.com",
      password: "Test1234#!",
      mustChangePassword: true,
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  /* ------------------------------------------------------------------ me */

  it("tells a signed-in person who they are", async () => {
    const cookie = await signIn(ctx, "session-owner@example.com");
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe("session-owner@example.com");
    expect(body.user.role).toBe("user");
    expect(body.mustChangePassword).toBe(false);
  });

  it("names the properties the person may work in", async () => {
    const cookie = await signIn(ctx, "session-owner@example.com");
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie },
    });
    const properties = res.json().properties;
    expect(properties.length).toBe(1);
    expect(properties[0].id).toBe(propertyId);
    expect(properties[0].name).toBe("Session Lodge");
    expect(properties[0].role).toBe("owner");
  });

  it("turns away a person who is not signed in", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  /* ------------------------------------------------------------- password */

  it("changes the password and keeps the person signed in", async () => {
    const cookie = await signIn(ctx, "changer@example.com");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/me/password",
      headers: { cookie, "content-type": "application/json" },
      payload: {
        currentPassword: "Test1234#!",
        newPassword: "ABrandNewPass1!",
      },
    });
    expect(res.statusCode).toBe(200);

    // The old session is closed and a new one is opened: the browser has
    // to be given the new cookie, or it is left holding a session that
    // no longer exists.
    const fresh = sessionCookie(res);
    expect(fresh).not.toBeNull();
    expect(fresh).not.toBe(cookie);

    const stale = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie },
    });
    expect(stale.statusCode).toBe(401);

    const live = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: fresh! },
    });
    expect(live.statusCode).toBe(200);
    expect(live.json().user.email).toBe("changer@example.com");
  });

  it("lets the new password sign in, and not the old one", async () => {
    const old = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json" },
      payload: {
        email: "changer@example.com",
        password: "Test1234#!",
      },
    });
    expect(old.statusCode).toBe(401);

    const fresh = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json" },
      payload: {
        email: "changer@example.com",
        password: "ABrandNewPass1!",
      },
    });
    expect(fresh.statusCode).toBe(200);
  });

  it("closes the other sessions of the person", async () => {
    // Two sessions: one on this computer, one on another.
    const first = await signIn(ctx, "changer@example.com", "ABrandNewPass1!");
    const second = await signIn(ctx, "changer@example.com", "ABrandNewPass1!");
    expect(first).not.toBe(second);

    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/me/password",
      headers: { cookie: second, "content-type": "application/json" },
      payload: {
        currentPassword: "ABrandNewPass1!",
        newPassword: "ChosenByTheUser1!",
      },
    });

    const other = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: first },
    });
    expect(other.statusCode).toBe(401);
  });

  it("clears the flag that asks for a new password", async () => {
    const person = await createUser(ctx, {
      email: "must-change@example.com",
      password: "Test1234#!",
      mustChangePassword: true,
    });
    assignStaff(ctx, propertyId, person.id, "receptionist");
    const cookie = await signIn(ctx, "must-change@example.com");

    // The flag is seen in the session, and the person cannot work yet.
    const before = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie },
    });
    expect(before.json().mustChangePassword).toBe(true);

    const blocked = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/me/password",
      headers: { cookie, "content-type": "application/json" },
      payload: {
        currentPassword: "Test1234#!",
        newPassword: "ChosenByTheUser1!",
      },
    });
    expect(res.statusCode).toBe(200);

    const row = ctx.db
      .select()
      .from(user)
      .all()
      .find((u) => u.email === "must-change@example.com")!;
    expect(row.mustChangePassword).toBe(false);

    // With the new cookie the person gets to work.
    const fresh = sessionCookie(res)!;
    const allowed = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie: fresh },
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("refuses a change when the current password is wrong", async () => {
    const cookie = await signIn(ctx, "session-owner@example.com");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/me/password",
      headers: { cookie, "content-type": "application/json" },
      payload: {
        currentPassword: "NotThePassword1!",
        newPassword: "AnotherPassword1!",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  /* --------------------------------------------------------------- guests */

  it("lists the guests of the property without a search term", async () => {
    const cookie = await signIn(ctx, "session-owner@example.com");
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/guests`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it("still finds a guest by name", async () => {
    const cookie = await signIn(ctx, "session-owner@example.com");
    await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/guests`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        firstName: "Ann",
        lastName: "Amos",
        phone: "+254700000099",
      },
    });
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/guests?q=Amos`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].lastName).toBe("Amos");
  });
});
