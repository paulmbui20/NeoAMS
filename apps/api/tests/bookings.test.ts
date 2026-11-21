// tests/bookings.test.ts
// The desk booking flow: creating, editing, guests, services and the
// lifecycle state machine.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  assignStaff,
  createTestCtx,
  createUser,
  seedProperty,
  signIn,
  type TestCtx,
} from "./helpers";
import { payments, rooms } from "../src/db/schema";
import { eq } from "drizzle-orm";

describe("desk bookings", () => {
  let ctx: TestCtx;
  let propertyId: number;
  let cookie: string;

  beforeAll(async () => {
    ctx = createTestCtx();
    const seeded = seedProperty(ctx, "Booking Lodge");
    propertyId = seeded.property.id;

    const owner = await createUser(ctx, {
      email: "booking-owner@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, owner.id, "owner");
    cookie = await signIn(ctx, "booking-owner@example.com");
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** Create a guest and return its id. */
  const newGuest = async (first: string, last: string, phone: string) => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/guests`,
      headers: { cookie, "content-type": "application/json" },
      payload: { firstName: first, lastName: last, phone },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as number;
  };

  /** A confirmed booking for two nights. */
  const newBooking = async (
    guestId: number,
    checkIn = "2027-06-01",
    checkOut = "2027-06-03",
    roomId = 1,
  ) => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId,
        guestId,
        stay: { type: "nightly", checkInDate: checkIn, checkOutDate: checkOut },
        adults: 1,
        children: 0,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  };

  /* ----------------------------------------------------------- creating */

  it("creates a confirmed booking with a reference", async () => {
    const guestId = await newGuest("Ann", "Amos", "+254700000101");
    const body = await newBooking(guestId);
    expect(body.booking.status).toBe("confirmed");
    expect(body.booking.bookingReferenceCode).toStartWith("BK-");
    // Two nights at 100_000 a night.
    expect(body.booking.totalCostCents).toBe(200_000);
    // The seeded property asks for a 30 percent deposit.
    expect(body.booking.depositRequiredCents).toBe(60_000);
    expect(body.guest.firstName).toBe("Ann");
    expect(body.room.roomNumber).toBe("101");
  });

  it("takes the deposit percentage from the property", async () => {
    await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { depositPercent: 50 },
    });
    const guestId = await newGuest("Ben", "Bo", "+254700000102");
    const body = await newBooking(guestId, "2027-07-01", "2027-07-03");
    expect(body.booking.depositRequiredCents).toBe(100_000);
  });

  it("lets the desk override the deposit", async () => {
    const guestId = await newGuest("Bao", "Bao", "+254700000123");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId: 1,
        guestId,
        stay: {
          type: "nightly",
          checkInDate: "2027-07-10",
          checkOutDate: "2027-07-12",
        },
        adults: 1,
        children: 0,
        depositRequiredCents: 25_000,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().booking.depositRequiredCents).toBe(25_000);
  });

  it("creates a guest from the booking when none is given", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId: 1,
        stay: {
          type: "nightly",
          checkInDate: "2027-08-01",
          checkOutDate: "2027-08-02",
        },
        adults: 1,
        children: 0,
        guest: {
          firstName: "Cara",
          lastName: "Cole",
          phone: "+254700000103",
        },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().guest.firstName).toBe("Cara");
  });

  it("refuses a party that is too big for the room", async () => {
    const guestId = await newGuest("Dan", "Dee", "+254700000104");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId: 1,
        guestId,
        stay: {
          type: "nightly",
          checkInDate: "2027-09-01",
          checkOutDate: "2027-09-02",
        },
        adults: 5,
        children: 0,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("OVER_CAPACITY");
  });

  it("refuses a double booking of the same room and dates", async () => {
    const guestId = await newGuest("Eve", "Eve", "+254700000105");
    await newBooking(guestId, "2027-10-01", "2027-10-03");
    const clash = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId: 1,
        guestId,
        stay: {
          type: "nightly",
          checkInDate: "2027-10-02",
          checkOutDate: "2027-10-04",
        },
        adults: 1,
        children: 0,
      },
    });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().error.code).toBe("ROOM_UNAVAILABLE");
  });

  it("allows the same dates in a different room", async () => {
    // A second room in the same property.
    await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/rooms`,
      headers: { cookie, "content-type": "application/json" },
      payload: { roomTypeId: 1, roomNumber: "102" },
    });
    const guestId = await newGuest("Fay", "Fay", "+254700000106");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId: 2,
        guestId,
        stay: {
          type: "nightly",
          checkInDate: "2027-10-01",
          checkOutDate: "2027-10-03",
        },
        adults: 1,
        children: 0,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("refuses to book a room that is not ready", async () => {
    ctx.db
      .update(rooms)
      .set({ status: "maintenance" })
      .where(eq(rooms.id, 2))
      .run();

    const guestId = await newGuest("Gil", "Gil", "+254700000107");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId: 2,
        guestId,
        stay: {
          type: "nightly",
          checkInDate: "2027-11-01",
          checkOutDate: "2027-11-02",
        },
        adults: 1,
        children: 0,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ROOM_UNAVAILABLE");

    // Put it back.
    ctx.db
      .update(rooms)
      .set({ status: "available" })
      .where(eq(rooms.id, 2))
      .run();
  });

  it("refuses a booking with neither a guest nor a guest id", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId: 1,
        stay: {
          type: "nightly",
          checkInDate: "2027-12-01",
          checkOutDate: "2027-12-02",
        },
        adults: 1,
        children: 0,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("records an initial payment", async () => {
    const guestId = await newGuest("Hal", "Hal", "+254700000108");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId: 1,
        guestId,
        stay: {
          type: "nightly",
          checkInDate: "2027-02-01",
          checkOutDate: "2027-02-03",
        },
        adults: 1,
        children: 0,
        initialPayment: {
          type: "payment",
          amountCents: 200_000,
          paymentMethod: "mpesa",
          transactionReferenceCode: "MPESA-BK001",
        },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().payments.length).toBe(1);
    expect(res.json().balance.netPaidCents).toBe(200_000);
    expect(res.json().balance.balanceCents).toBe(0);
  });

  it("rejects an initial payment above the booking total", async () => {
    const guestId = await newGuest("Ivy", "Ives", "+254700000109");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId: 1,
        guestId,
        stay: {
          type: "nightly",
          checkInDate: "2030-02-01",
          checkOutDate: "2030-02-03",
        },
        adults: 1,
        children: 0,
        initialPayment: {
          type: "payment",
          amountCents: 200_001,
          paymentMethod: "cash",
        },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("PAYMENT_EXCEEDS_BALANCE");
  });

  it("rejects a desk payment above the remaining booking balance", async () => {
    const guestId = await newGuest("Jules", "Jones", "+254700000110");
    const booking = await newBooking(guestId, "2030-03-01", "2030-03-03");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${booking.booking.id}/payments`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        type: "payment",
        amountCents: booking.booking.totalCostCents + 1,
        paymentMethod: "cash",
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("PAYMENT_EXCEEDS_BALANCE");
  });

  it("reserves the remaining balance across pending guest proofs", async () => {
    const guestId = await newGuest("Kai", "King", "+254700000111");
    const booking = await newBooking(guestId, "2030-04-01", "2030-04-03");
    const submit = (amountCents: number, ref: string) =>
      ctx.app.inject({
        method: "POST",
        url: `/api/v1/public/bookings/${booking.booking.bookingReferenceCode}/payments`,
        headers: { "content-type": "application/json" },
        payload: {
          phone: "+254700000111",
          amountCents,
          paymentMethod: "mpesa",
          transactionReferenceCode: ref,
        },
      });

    expect((await submit(150_000, "PROOF-KAI1")).statusCode).toBe(201);
    const excess = await submit(50_001, "PROOF-KAI2");
    expect(excess.statusCode).toBe(409);
    expect(excess.json().error.code).toBe("PAYMENT_EXCEEDS_BALANCE");
  });

  it("rejects approval of a pending proof if it would overpay the booking", async () => {
    const guestId = await newGuest("Lee", "Lo", "+254700000112");
    const booking = await newBooking(guestId, "2030-05-01", "2030-05-03");
    await ctx.app.inject({
      method: "POST",
      url: `/api/v1/public/bookings/${booking.booking.bookingReferenceCode}/payments`,
      headers: { "content-type": "application/json" },
      payload: {
        phone: "+254700000112",
        amountCents: 100_000,
        paymentMethod: "mpesa",
        transactionReferenceCode: "PROOF-LEE1",
      },
    });
    const pending = ctx.db
      .select()
      .from(payments)
      .where(eq(payments.bookingId, booking.booking.id))
      .get()!;
    await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${booking.booking.id}/payments`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        type: "payment",
        amountCents: 150_000,
        paymentMethod: "cash",
      },
    });
    const review = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/payments/${pending.id}/review`,
      headers: { cookie, "content-type": "application/json" },
      payload: { decision: "succeeded" },
    });
    expect(review.statusCode).toBe(409);
    expect(review.json().error.code).toBe("PAYMENT_EXCEEDS_BALANCE");
  });

  it("limits cumulative refunds to the original successful payment", async () => {
    const guestId = await newGuest("Mia", "Mills", "+254700000113");
    const booking = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomId: 1,
        guestId,
        stay: {
          type: "nightly",
          checkInDate: "2030-06-01",
          checkOutDate: "2030-06-03",
        },
        adults: 1,
        children: 0,
        initialPayment: {
          type: "payment",
          amountCents: 200_000,
          paymentMethod: "cash",
        },
      },
    });
    const paymentId = booking.json().payments[0].id as number;
    const refund = (amountCents: number, ref: string) =>
      ctx.app.inject({
        method: "POST",
        url: `/api/v1/properties/${propertyId}/payments/${paymentId}/refund`,
        headers: { cookie, "content-type": "application/json" },
        payload: {
          amountCents,
          paymentMethod: "cash",
          reason: "Test refund",
          transactionReferenceCode: ref,
        },
      });

    const partial = await refund(150_000, "REFUND-MIA1");
    expect(partial.statusCode).toBe(201);
    const refundOfRefund = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/payments/${partial.json().refund.id}/refund`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        amountCents: 1,
        paymentMethod: "cash",
        reason: "Refunds cannot be refunded",
      },
    });
    expect(refundOfRefund.statusCode).toBe(422);
    expect(refundOfRefund.json().error.code).toBe("NOT_REFUNDABLE");
    const excess = await refund(50_001, "REFUND-MIA2");
    expect(excess.statusCode).toBe(409);
    expect(excess.json().error.code).toBe("REFUND_EXCEEDS_PAYMENT");
  });

  /* ------------------------------------------------------------- reading */

  it("lists the bookings", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/bookings`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.total).toBeGreaterThanOrEqual(3);
  });

  it("filters the list by status", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/bookings?status=confirmed`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    for (const row of res.json().data) {
      expect(row.status).toBe("confirmed");
    }
  });

  it("finds a booking by reference", async () => {
    const guestId = await newGuest("Ivy", "Ivy", "+254700000109");
    const created = await newBooking(guestId, "2027-03-01", "2027-03-02");
    const reference = created.booking.bookingReferenceCode;

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/bookings?q=${encodeURIComponent(reference)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].reference).toBe(reference);
  });

  it("does not let a reference match other guests by their phone number", async () => {
    // A reference carries digits. Those digits must not drag in every guest
    // whose phone number happens to contain them.
    const guestId = await newGuest("Zed", "Zed", "+254700000909");
    const created = await newBooking(guestId, "2027-03-05", "2027-03-06");
    const reference = created.booking.bookingReferenceCode;

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/bookings?q=${encodeURIComponent(reference)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].reference).toBe(reference);
  });

  it("finds a booking by the guest's name", async () => {
    const guestId = await newGuest("Wilhelmina", "Wunderlich", "+254700000111");
    await newBooking(guestId, "2027-03-10", "2027-03-11");

    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/properties/" + propertyId + "/bookings?q=Wilhelmina",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].guestName).toBe("Wilhelmina Wunderlich");
  });

  it("finds a booking by the guest's phone number", async () => {
    const guestId = await newGuest("Phoney", "Phoney", "+254711223344");
    await newBooking(guestId, "2027-03-15", "2027-03-16");

    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/properties/" + propertyId + "/bookings?q=0711223344",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].guestPhone).toBe("+254711223344");
  });

  it("answers 404 for a booking of another property", async () => {
    const other = seedProperty(ctx, "Other Booking Lodge");
    const admin = await createUser(ctx, {
      email: "booking-admin@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    expect(admin.role).toBe("admin");
    const adminCookie = await signIn(ctx, "booking-admin@example.com");
    const guestId = await newGuest("Jan", "Jan", "+254700000110");
    const created = await newBooking(guestId, "2027-04-01", "2027-04-02");

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${other.property.id}/bookings/${created.booking.id}`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  /* ------------------------------------------------------------- editing */

  it("edits the party size and the requests", async () => {
    const guestId = await newGuest("Kim", "Kim", "+254700000111");
    const created = await newBooking(guestId, "2027-05-01", "2027-05-02");
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { adults: 2, specialRequests: "Extra pillows" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.adults).toBe(2);
    expect(res.json().booking.specialRequests).toBe("Extra pillows");
  });

  it("refuses an edit that breaks the room capacity", async () => {
    const guestId = await newGuest("Lou", "Lou", "+254700000112");
    const created = await newBooking(guestId, "2027-05-10", "2027-05-12");
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { adults: 9 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("OVER_CAPACITY");
  });

  it("refuses a deposit larger than the total", async () => {
    const guestId = await newGuest("Moe", "Moe", "+254700000113");
    const created = await newBooking(guestId, "2027-05-20", "2027-05-22");
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { depositRequiredCents: 999_999_999 },
    });
    expect(res.statusCode).toBe(400);
  });

  /* -------------------------------------------------------------- guests */

  it("adds and removes an additional guest", async () => {
    const guestId = await newGuest("Nan", "Nan", "+254700000114");
    const extraId = await newGuest("Ola", "Ola", "+254700000115");
    const created = await newBooking(guestId, "2027-06-10", "2027-06-12");

    const added = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/guests`,
      headers: { cookie, "content-type": "application/json" },
      payload: { guestId: extraId },
    });
    expect(added.statusCode).toBe(201);
    expect(added.json().additionalGuests.length).toBe(1);
    expect(added.json().additionalGuests[0].firstName).toBe("Ola");

    // Adding the same guest twice is refused.
    const again = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/guests`,
      headers: { cookie, "content-type": "application/json" },
      payload: { guestId: extraId },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("ALREADY_ADDED");

    const removed = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/guests/${extraId}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().additionalGuests.length).toBe(0);
  });

  it("refuses the lead guest as an additional guest", async () => {
    const guestId = await newGuest("Pat", "Pat", "+254700000116");
    const created = await newBooking(guestId, "2027-06-20", "2027-06-22");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/guests`,
      headers: { cookie, "content-type": "application/json" },
      payload: { guestId },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ALREADY_PRIMARY_GUEST");
  });

  /* ------------------------------------------------------------ services */

  it("adds and removes a service line", async () => {
    const service = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/services`,
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "Airport Transfer", priceCents: 15_000 },
    });
    expect(service.statusCode).toBe(201);
    const serviceId = service.json().id;

    const guestId = await newGuest("Quin", "Quin", "+254700000117");
    const created = await newBooking(guestId, "2027-07-15", "2027-07-17");

    const added = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/services`,
      headers: { cookie, "content-type": "application/json" },
      payload: { serviceId, quantity: 2 },
    });
    expect(added.statusCode).toBe(201);
    expect(added.json().services.length).toBe(1);
    expect(added.json().services[0].subtotalCents).toBe(30_000);

    const removed = await ctx.app.inject({
      method: "DELETE",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/services/${added.json().services[0].id}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().services.length).toBe(0);
  });

  it("refuses a service from another property", async () => {
    const other = seedProperty(ctx, "Other Service Lodge");
    const admin = await createUser(ctx, {
      email: "booking-admin-2@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    expect(admin.role).toBe("admin");
    const adminCookie = await signIn(ctx, "booking-admin-2@example.com");

    const service = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${other.property.id}/services`,
      headers: { cookie: adminCookie, "content-type": "application/json" },
      payload: { name: "Spa", priceCents: 20_000 },
    });
    const serviceId = service.json().id;

    const guestId = await newGuest("Roy", "Roy", "+254700000118");
    const created = await newBooking(guestId, "2027-07-20", "2027-07-22");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/services`,
      headers: { cookie, "content-type": "application/json" },
      payload: { serviceId },
    });
    expect(res.statusCode).toBe(404);
  });

  /* ----------------------------------------------------------- lifecycle */

  it("checks a guest in and out, moving the room with them", async () => {
    const guestId = await newGuest("Sam", "Sam", "+254700000119");
    const created = await newBooking(guestId, "2027-08-10", "2027-08-12");

    const checkIn = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/check-in`,
      headers: { cookie },
    });
    expect(checkIn.statusCode).toBe(200);
    expect(checkIn.json().booking.status).toBe("checked_in");
    // The room is now occupied.
    const room = ctx.db
      .select()
      .from(rooms)
      .all()
      .find((r) => r.id === 1)!;
    expect(room.status).toBe("occupied");

    const checkOut = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/check-out`,
      headers: { cookie },
    });
    expect(checkOut.statusCode).toBe(200);
    expect(checkOut.json().booking.status).toBe("checked_out");
    // And dirty afterwards, ready for housekeeping.
    const after = ctx.db
      .select()
      .from(rooms)
      .all()
      .find((r) => r.id === 1)!;
    expect(after.status).toBe("dirty");

    ctx.db.update(rooms).set({ status: "available" }).run();
  });

  it("refuses an impossible transition", async () => {
    const guestId = await newGuest("Tia", "Tia", "+254700000120");
    const created = await newBooking(guestId, "2027-08-20", "2027-08-22");

    // A confirmed booking cannot be checked out directly.
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/check-out`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("INVALID_TRANSITION");
  });

  it("cancels a confirmed booking with a reason", async () => {
    const guestId = await newGuest("Uma", "Uma", "+254700000121");
    const created = await newBooking(guestId, "2027-09-10", "2027-09-12");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/cancel`,
      headers: { cookie, "content-type": "application/json" },
      payload: { reason: "Guest changed plans" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.status).toBe("cancelled");
  });

  it("refuses to cancel without a reason", async () => {
    const guestId = await newGuest("Vic", "Vic", "+254700000122");
    const created = await newBooking(guestId, "2027-09-20", "2027-09-22");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/cancel`,
      headers: { cookie, "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses to edit a cancelled booking", async () => {
    const guestId = await newGuest("Wes", "Wes", "+254700000123");
    const created = await newBooking(guestId, "2027-09-01", "2027-09-03");
    await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/cancel`,
      headers: { cookie, "content-type": "application/json" },
      payload: { reason: "Withdrawn" },
    });
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { adults: 2 },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("BOOKING_CLOSED");
  });

  it("marks a booking as a no-show", async () => {
    const guestId = await newGuest("Xan", "Xan", "+254700000124");
    const created = await newBooking(guestId, "2027-10-10", "2027-10-12");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/bookings/${created.booking.id}/no-show`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.status).toBe("no_show");
  });
});
