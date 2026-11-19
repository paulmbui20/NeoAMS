// tests/overview.test.ts
// The "today" screen and the audit trail.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  assignStaff,
  createTestCtx,
  createUser,
  seedProperty,
  signIn,
  type TestCtx,
} from "./helpers";
import { bookings, guests, rooms } from "../src/db/schema";

describe("today overview", () => {
  let ctx: TestCtx;
  let propertyId: number;
  let cookie: string;

  beforeAll(async () => {
    ctx = createTestCtx();
    const seeded = seedProperty(ctx, "Today Lodge");
    propertyId = seeded.property.id;

    const owner = await createUser(ctx, {
      email: "today-owner@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, owner.id, "owner");
    cookie = await signIn(ctx, "today-owner@example.com");
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** A booking that starts or ends on the given day (Africa/Nairobi). */
  const makeBooking = (
    reference: string,
    checkIn: Date,
    checkOut: Date,
    status:
      "pending" | "confirmed" | "checked_in" | "checked_out" = "confirmed",
  ) => {
    const guest = ctx.db
      .insert(guests)
      .values({
        firstName: "Today",
        lastName: reference,
        phone: `+25470000${reference.slice(-4)}`,
      })
      .returning()
      .get();
    return ctx.db
      .insert(bookings)
      .values({
        guestId: guest.id,
        roomId: 1,
        bookingReferenceCode: reference,
        status,
        rateType: "nightly",
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults: 1,
        children: 0,
        totalCostCents: 100_000,
        depositRequiredCents: 30_000,
        source: "walk_in",
      })
      .returning()
      .get();
  };

  it("starts empty", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/today`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.arrivals).toEqual([]);
    expect(body.departures).toEqual([]);
    expect(body.inHouse).toEqual([]);
    expect(body.counts.arrivals).toBe(0);
    expect(body.counts.totalRooms).toBe(1);
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("counts an arrival on the day", async () => {
    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(11, 0, 0, 0); // 14:00 in Nairobi
    const end = new Date(start.getTime() + 24 * 3600_000);
    makeBooking("T-ARR1", start, end, "confirmed");

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/today`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.counts.arrivals).toBe(1);
    expect(body.arrivals[0].reference).toBe("T-ARR1");
    expect(body.arrivals[0].roomNumber).toBe("101");
  });

  it("counts a departure on the day", async () => {
    const now = new Date();
    const end = new Date(now);
    end.setUTCHours(7, 0, 0, 0); // 10:00 in Nairobi
    const start = new Date(end.getTime() - 24 * 3600_000);
    makeBooking("T-DEP1", start, end, "checked_in");

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/today`,
      headers: { cookie },
    });
    const body = res.json();
    expect(body.counts.departures).toBe(1);
    expect(body.counts.inHouse).toBe(1);
    expect(body.inHouse[0].reference).toBe("T-DEP1");
  });

  it("lists the rooms that need attention", async () => {
    // Mark the room dirty directly, the way housekeeping would.
    ctx.db.update(rooms).set({ status: "dirty" }).run();

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/today`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.counts.dirtyRooms).toBe(1);
    expect(body.dirtyRooms[0].status).toBe("dirty");

    // Put it back so the rest of the suite is unaffected.
    ctx.db.update(rooms).set({ status: "available" }).run();
  });

  it("leaves out stays on other days", async () => {
    const far = new Date();
    far.setUTCFullYear(far.getUTCFullYear() + 2);
    makeBooking("T-FAR1", far, new Date(far.getTime() + 86_400_000));

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/today`,
      headers: { cookie },
    });
    const references = res
      .json()
      .arrivals.map((a: { reference: string }) => a.reference);
    expect(references).not.toContain("T-FAR1");
  });
});

describe("audit trail", () => {
  let ctx: TestCtx;
  let propertyId: number;
  let cookie: string;

  beforeAll(async () => {
    ctx = createTestCtx();
    const seeded = seedProperty(ctx, "Audit Lodge");
    propertyId = seeded.property.id;

    const owner = await createUser(ctx, {
      email: "audit-owner@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, owner.id, "owner");
    cookie = await signIn(ctx, "audit-owner@example.com");
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("starts empty", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/audit-logs`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(0);
  });

  it("records an edit and lists it", async () => {
    // Create a guest and a booking, then edit the booking: the service writes
    // an audit row.
    const guest = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/guests`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        firstName: "Audit",
        lastName: "Guest",
        phone: "+254700009999",
      },
    });
    expect(guest.statusCode).toBe(201);

    const booking = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId: 1,
        guestId: guest.json().id,
        stay: {
          type: "nightly",
          checkInDate: "2027-06-01",
          checkOutDate: "2027-06-03",
        },
        adults: 1,
        children: 0,
      },
    });
    expect(booking.statusCode).toBe(201);

    const edit = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/bookings/${booking.json().booking.id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { adults: 2, specialRequests: "Late arrival" },
    });
    expect(edit.statusCode).toBe(200);

    const logs = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/audit-logs`,
      headers: { cookie },
    });
    expect(logs.statusCode).toBe(200);
    const rows = logs.json().data;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const update = rows.find(
      (r: { action: string }) => r.action === "booking.updated",
    );
    expect(update).toBeDefined();
    expect(update.entity).toBe("booking");
    // The before and after values are parsed, not raw strings.
    expect(update.oldValues.adults).toBe(1);
    expect(update.newValues.adults).toBe(2);
  });

  it("filters by entity and by user", async () => {
    const byEntity = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/audit-logs?entity=booking`,
      headers: { cookie },
    });
    expect(byEntity.statusCode).toBe(200);
    for (const row of byEntity.json().data) {
      expect(row.entity).toBe("booking");
    }

    const byUser = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/audit-logs?userId=nobody`,
      headers: { cookie },
    });
    expect(byUser.statusCode).toBe(200);
    expect(byUser.json().data.length).toBe(0);
  });

  it("paginates the trail", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/audit-logs?limit=1`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
    expect(res.json().meta.limit).toBe(1);
  });

  it("keeps the trail away from managers", async () => {
    const manager = await createUser(ctx, {
      email: "audit-manager@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, manager.id, "manager");
    const managerCookie = await signIn(ctx, "audit-manager@example.com");
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/audit-logs`,
      headers: { cookie: managerCookie },
    });
    expect(res.statusCode).toBe(403);
  });
});
