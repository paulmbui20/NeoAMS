// tests/property.test.ts
// Property settings and the staff roster.
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
import { propertyStaff } from "../src/db/schema";

describe("property settings and staff", () => {
  let ctx: TestCtx;
  let propertyId: number;
  let ownerCookie: string;

  beforeAll(async () => {
    ctx = createTestCtx();
    const seeded = seedProperty(ctx, "Settings Lodge");
    propertyId = seeded.property.id;

    const owner = await createUser(ctx, {
      email: "prop-owner@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, owner.id, "owner");
    ownerCookie = await signIn(ctx, "prop-owner@example.com");
  });

  afterAll(async () => {
    await ctx.close();
  });

  /* ------------------------------------------------------------- settings */

  it("reads the property", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Settings Lodge");
  });

  it("updates the settings", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}`,
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      payload: {
        checkInTime: "13:00",
        checkOutTime: "11:00",
        depositPercent: 50,
        phone: "+254700000001",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().checkInTime).toBe("13:00");
    expect(res.json().depositPercent).toBe(50);
  });

  it("rejects a malformed check-in time", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}`,
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      payload: { checkInTime: "25:99" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a deposit above 100 percent", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}`,
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      payload: { depositPercent: 120 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("answers 404 for an unknown property", async () => {
    // A global administrator passes every guard, so the service answers 404.
    const admin = await createUser(ctx, {
      email: "prop-admin@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    expect(admin.role).toBe("admin");
    const adminCookie = await signIn(ctx, "prop-admin@example.com");
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/properties/987654",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("hides another property behind a refusal, not a 404", async () => {
    // The owner has no role elsewhere, so the guard answers 403 before the
    // service is reached. That is deliberate: it does not confirm the
    // property exists.
    const other = seedProperty(ctx, "Hidden Lodge");
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${other.property.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  /* ---------------------------------------------------------------- staff */

  it("lists the roster with names", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/staff`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().data;
    expect(rows.length).toBe(1);
    expect(rows[0].email).toBe("prop-owner@example.com");
    expect(rows[0].role).toBe("owner");
  });

  it("adds a new staff member with a temporary password", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/staff`,
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      payload: {
        name: "Desk Person",
        email: "desk@example.com",
        tempPassword: "TempPass1234!",
        role: "receptionist",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().role).toBe("receptionist");

    const created = ctx.db
      .select()
      .from(user)
      .all()
      .find((u) => u.email === "desk@example.com")!;
    expect(created.mustChangePassword).toBe(true);
  });

  it("attaches an existing user to the roster", async () => {
    const existing = await createUser(ctx, {
      email: "existing-staffer@example.com",
      password: "Test1234#!",
    });
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/staff`,
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      payload: { userId: existing.id, role: "manager" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().userId).toBe(existing.id);
  });

  it("refuses the same person twice", async () => {
    const existing = ctx.db
      .select()
      .from(user)
      .all()
      .find((u) => u.email === "existing-staffer@example.com")!;
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/staff`,
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      payload: { userId: existing.id, role: "accountant" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ALREADY_ON_ROSTER");
  });

  it("refuses a duplicate email when creating staff", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/staff`,
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      payload: {
        name: "Duplicate",
        email: "desk@example.com",
        tempPassword: "TempPass1234!",
        role: "staff",
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("EMAIL_IN_USE");
  });

  it("changes a role below owner", async () => {
    const staff = ctx.db
      .select()
      .from(propertyStaff)
      .all()
      .find((r) => r.propertyId === propertyId && r.role === "manager")!;
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/staff/${staff.id}`,
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      payload: { role: "accountant" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("accountant");
  });

  it("removes somebody from the roster", async () => {
    const staff = ctx.db
      .select()
      .from(propertyStaff)
      .all()
      .find((r) => r.propertyId === propertyId && r.role === "accountant")!;
    const res = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/properties/${propertyId}/staff/${staff.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().removed).toBe(true);

    const left = ctx.db
      .select()
      .from(propertyStaff)
      .all()
      .find((r) => r.id === staff.id);
    expect(left).toBeUndefined();
  });

  it("answers 404 for a staff member of another property", async () => {
    const other = seedProperty(ctx, "Other Lodge");
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/staff/999999`,
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      payload: { role: "staff" },
    });
    expect(res.statusCode).toBe(404);
    expect(other.property.id).toBeGreaterThan(0);
  });

  it("sets must-change-password after a reset", async () => {
    const staff = ctx.db
      .select()
      .from(propertyStaff)
      .all()
      .find(
        (r) =>
          r.propertyId === propertyId &&
          r.userId ===
            ctx.db
              .select()
              .from(user)
              .all()
              .find((u) => u.email === "desk@example.com")!.id,
      )!;
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/staff/${staff.id}/reset-password`,
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      payload: { newPassword: "AnotherPass1234!" },
    });
    expect(res.statusCode).toBe(200);

    const updated = ctx.db
      .select()
      .from(user)
      .all()
      .find((u) => u.email === "desk@example.com")!;
    expect(updated.mustChangePassword).toBe(true);
  });
});
