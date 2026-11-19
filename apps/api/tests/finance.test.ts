// tests/finance.test.ts
// Expenses, expense categories and the reports.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  assignStaff,
  createTestCtx,
  createUser,
  seedProperty,
  signIn,
  type TestCtx,
} from "./helpers";
import { bookings, guests, payments } from "../src/db/schema";

describe("finance", () => {
  let ctx: TestCtx;
  let propertyId: number;
  let cookie: string;

  beforeAll(async () => {
    ctx = createTestCtx();
    const seeded = seedProperty(ctx, "Finance Lodge");
    propertyId = seeded.property.id;

    const owner = await createUser(ctx, {
      email: "finance-owner@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, owner.id, "owner");
    cookie = await signIn(ctx, "finance-owner@example.com");
  });

  afterAll(async () => {
    await ctx.close();
  });

  /* ----------------------------------------------------------- categories */

  it("creates an expense category", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/expense-categories`,
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "Utilities", description: "Power and water" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("Utilities");
  });

  it("refuses a duplicate category", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/expense-categories`,
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "Utilities" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CATEGORY_EXISTS");
  });

  it("lists the categories", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/expense-categories`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
  });

  /* -------------------------------------------------------------- expenses */

  it("records an expense", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/expenses`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        categoryId: 1,
        description: "January electricity",
        amountCents: 45_000,
        paymentMethod: "mpesa",
        reference: "MPESA-XYZ1",
        expenseDate: "2027-01-15",
        notes: "Token purchase",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.amountCents).toBe(45_000);
    expect(body.expenseDate).toBe("2027-01-15");
    // The recorder is filled in from the session, not from the body.
    expect(body.recordedBy).toBeString();
  });

  it("rejects a zero amount", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/expenses`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        categoryId: 1,
        description: "Nothing",
        amountCents: 0,
        expenseDate: "2027-01-15",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a malformed date", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/expenses`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        categoryId: 1,
        description: "Bad date",
        amountCents: 100,
        expenseDate: "15-01-2027",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown category", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/expenses`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        categoryId: 9999,
        description: "Ghost category",
        amountCents: 100,
        expenseDate: "2027-01-15",
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("lists the expenses with their category names", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/expenses`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].categoryName).toBe("Utilities");
    expect(body.meta.total).toBe(1);
  });

  it("filters expenses by date and by category", async () => {
    const inRange = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/expenses?from=2027-01-01&to=2027-01-31`,
      headers: { cookie },
    });
    expect(inRange.json().data.length).toBe(1);

    const outOfRange = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/expenses?from=2027-02-01&to=2027-02-28`,
      headers: { cookie },
    });
    expect(outOfRange.json().data.length).toBe(0);

    const byCategory = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/expenses?categoryId=1`,
      headers: { cookie },
    });
    expect(byCategory.json().data.length).toBe(1);
  });

  it("updates an expense", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/expenses/1`,
      headers: { cookie, "content-type": "application/json" },
      payload: { amountCents: 50_000, description: "Corrected electricity" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().amountCents).toBe(50_000);
    expect(res.json().description).toBe("Corrected electricity");
  });

  it("answers 404 for an expense of another property", async () => {
    const other = seedProperty(ctx, "Other Finance Lodge");
    const admin = await createUser(ctx, {
      email: "finance-admin@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    expect(admin.role).toBe("admin");
    const adminCookie = await signIn(ctx, "finance-admin@example.com");
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${other.property.id}/expenses/1`,
      headers: { cookie: adminCookie, "content-type": "application/json" },
      payload: { amountCents: 1 },
    });
    expect(res.statusCode).toBe(404);
  });

  /* --------------------------------------------------------------- reports */

  it("reports an empty summary for a fresh property", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/reports/summary`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.roomRevenueCents).toBe(0);
    expect(body.expenseCents).toBe(50_000);
    expect(body.netCents).toBe(-50_000);
    expect(body.bookings).toBe(0);
  });

  it("counts checked-out revenue and successful payments", async () => {
    // A completed stay: revenue 120_000, with 120_000 collected.
    const now = new Date("2027-01-20T09:00:00.000Z");
    const guest = ctx.db
      .insert(guests)
      .values({
        firstName: "Revenue",
        lastName: "Guest",
        phone: "+254700001234",
      })
      .returning()
      .get();

    const bookingId = ctx.db
      .insert(bookings)
      .values({
        guestId: guest.id,
        roomId: 1,
        bookingReferenceCode: "FIN-0001",
        status: "checked_out",
        rateType: "nightly",
        checkInDate: new Date("2027-01-18T11:00:00.000Z"),
        checkOutDate: new Date("2027-01-20T07:00:00.000Z"),
        adults: 2,
        children: 0,
        totalCostCents: 120_000,
        depositRequiredCents: 60_000,
        source: "walk_in",
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    ctx.db
      .insert(payments)
      .values({
        bookingId: bookingId.id,
        type: "payment",
        amountCents: 120_000,
        paymentMethod: "mpesa",
        status: "succeeded",
        transactionReferenceCode: "MPESA-FIN1",
        paymentDate: new Date("2027-01-20T08:00:00.000Z"),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/reports/summary`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.roomRevenueCents).toBe(120_000);
    expect(body.collectedCents).toBe(120_000);
    expect(body.expenseCents).toBe(50_000);
    expect(body.netCents).toBe(70_000);
    expect(body.bookings).toBe(1);
  });

  it("groups revenue by day", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/reports/revenue?groupBy=day`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.groupBy).toBe("day");
    expect(body.data.length).toBe(1);
    expect(body.data[0].totalCents).toBe(120_000);
    expect(body.data[0].bookings).toBe(1);
    expect(body.data[0].period).toBe("2027-01-20");
  });

  it("groups revenue by month", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/reports/revenue?groupBy=month`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().groupBy).toBe("month");
    expect(res.json().data[0].period).toBe("2027-01");
  });

  it("excludes stays outside the window", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/reports/summary?from=2027-03-01&to=2027-03-31`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().roomRevenueCents).toBe(0);
    expect(res.json().expenseCents).toBe(0);
  });

  it("rejects an unknown grouping", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/reports/revenue?groupBy=fortnight`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });
});
