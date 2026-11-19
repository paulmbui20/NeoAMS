// tests/catalog.test.ts
// Inventory: room types, rooms, amenities and bookable services.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  assignStaff,
  createTestCtx,
  createUser,
  seedProperty,
  signIn,
  type TestCtx,
} from "./helpers";

describe("catalog", () => {
  let ctx: TestCtx;
  let propertyId: number;
  let roomTypeId: number;
  let cookie: string;

  beforeAll(async () => {
    ctx = createTestCtx();
    const seeded = seedProperty(ctx, "Catalog Lodge");
    propertyId = seeded.property.id;
    roomTypeId = seeded.roomType.id;

    const owner = await createUser(ctx, {
      email: "catalog-owner@example.com",
      password: "Test1234#!",
    });
    assignStaff(ctx, propertyId, owner.id, "owner");
    cookie = await signIn(ctx, "catalog-owner@example.com");

    // A global administrator, used where a guard has to be bypassed.
    await createUser(ctx, {
      email: "catalog-admin@example.com",
      password: "Test1234#!",
      role: "admin",
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  /* ----------------------------------------------------------- room types */

  it("lists the room types with their amenity ids", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/room-types`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().data;
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Standard Room");
    expect(rows[0].amenityIds).toEqual([]);
  });

  it("creates a room type with a generated slug", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/room-types`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        name: "Deluxe Suite",
        pricePerNightCents: 250_000,
        pricePerHourCents: 40_000,
        maxOccupancy: 4,
        bedConfiguration: "1 King",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.slug).toBe("deluxe-suite");
    expect(body.maxOccupancy).toBe(4);
    expect(body.isActive).toBe(true);
  });

  it("gives a repeated room type name a distinct slug", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/room-types`,
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "Deluxe Suite", pricePerNightCents: 260_000 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().slug).toBe("deluxe-suite-1");
  });

  it("rejects a room type with a negative price", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/room-types`,
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "Bad", pricePerNightCents: -5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("reads one room type", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/room-types/${roomTypeId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(roomTypeId);
  });

  it("answers 404 for a room type of another property", async () => {
    const other = seedProperty(ctx, "Far Lodge");
    // The owner has no role there, so the guard refuses first.
    const refused = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${other.property.id}/room-types/${roomTypeId}`,
      headers: { cookie },
    });
    expect(refused.statusCode).toBe(403);

    // A global administrator passes the guard, and the service says 404.
    const adminCookie = await signIn(ctx, "catalog-admin@example.com");
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${other.property.id}/room-types/${roomTypeId}`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("updates a room type", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/room-types/${roomTypeId}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { pricePerNightCents: 120_000, description: "Renovated" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pricePerNightCents).toBe(120_000);
    expect(res.json().description).toBe("Renovated");
  });

  it("sets the amenities of a room type", async () => {
    const amenity = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/amenities`,
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "Wi-Fi", icon: "wifi" },
    });
    expect(amenity.statusCode).toBe(201);
    const amenityId = amenity.json().id;

    const res = await ctx.app.inject({
      method: "PUT",
      url: `/api/v1/properties/${propertyId}/room-types/${roomTypeId}/amenities`,
      headers: { cookie, "content-type": "application/json" },
      payload: { amenityIds: [amenityId] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);

    const read = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/room-types/${roomTypeId}`,
      headers: { cookie },
    });
    expect(read.json().amenityIds).toEqual([amenityId]);
  });

  it("replaces the amenities rather than adding to them", async () => {
    const res = await ctx.app.inject({
      method: "PUT",
      url: `/api/v1/properties/${propertyId}/room-types/${roomTypeId}/amenities`,
      headers: { cookie, "content-type": "application/json" },
      payload: { amenityIds: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(0);
  });

  /* ----------------------------------------------------------------- rooms */

  it("lists the rooms", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/rooms`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].roomNumber).toBe("101");
  });

  it("creates a room", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/rooms`,
      headers: { cookie, "content-type": "application/json" },
      payload: {
        roomTypeId,
        roomNumber: "102",
        floor: "First",
        description: "Sea view",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("available");
    expect(res.json().isActive).toBe(true);
  });

  it("refuses a duplicate room number", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/rooms`,
      headers: { cookie, "content-type": "application/json" },
      payload: { roomTypeId, roomNumber: "102" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ROOM_NUMBER_IN_USE");
  });

  it("refuses a room type from another property", async () => {
    const other = seedProperty(ctx, "Other Catalog Lodge");
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/rooms`,
      headers: { cookie, "content-type": "application/json" },
      payload: { roomTypeId: other.roomType.id, roomNumber: "500" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("filters rooms by floor and status", async () => {
    const byFloor = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/rooms?floor=First`,
      headers: { cookie },
    });
    expect(byFloor.json().data.length).toBe(1);

    const byStatus = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/rooms?status=available`,
      headers: { cookie },
    });
    expect(byStatus.json().data.length).toBe(2);

    const empty = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/rooms?status=out_of_order`,
      headers: { cookie },
    });
    expect(empty.json().data.length).toBe(0);
  });

  it("changes the status of a room", async () => {
    const rooms = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/rooms`,
      headers: { cookie },
    });
    const roomId = rooms.json().data[0].id;
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/rooms/${roomId}/status`,
      headers: { cookie, "content-type": "application/json" },
      payload: { status: "dirty" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("dirty");
  });

  it("rejects an unknown room status", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/rooms/1/status`,
      headers: { cookie, "content-type": "application/json" },
      payload: { status: "on_fire" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("updates a room", async () => {
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/rooms/1`,
      headers: { cookie, "content-type": "application/json" },
      payload: { description: "Corner room", isActive: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBe("Corner room");
    expect(res.json().isActive).toBe(false);
  });

  /* ------------------------------------------------------------- amenities */

  it("lists every amenity with the selected ones", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/amenities`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.all.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.selected)).toBe(true);
  });

  it("refuses a duplicate amenity", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/amenities`,
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "Wi-Fi" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("AMENITY_EXISTS");
  });

  it("selects amenities for the property", async () => {
    const all = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/amenities`,
      headers: { cookie },
    });
    const amenityId = all.json().data.all[0].id;
    const res = await ctx.app.inject({
      method: "PUT",
      url: `/api/v1/properties/${propertyId}/amenities`,
      headers: { cookie, "content-type": "application/json" },
      payload: { amenityIds: [amenityId] },
    });
    expect(res.statusCode).toBe(200);

    const read = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/amenities`,
      headers: { cookie },
    });
    expect(read.json().data.selected).toEqual([amenityId]);
  });

  /* -------------------------------------------------------------- services */

  it("creates a service", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/properties/${propertyId}/services`,
      headers: { cookie, "content-type": "application/json" },
      payload: { name: "Breakfast", priceCents: 5_000, description: "Full" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().slug).toBe("breakfast");
    expect(res.json().isActive).toBe(true);
  });

  it("lists the services", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/services`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
  });

  it("retires a service instead of deleting it", async () => {
    const list = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/services`,
      headers: { cookie },
    });
    const id = list.json().data[0].id;
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${propertyId}/services/${id}`,
      headers: { cookie, "content-type": "application/json" },
      payload: { isActive: false, priceCents: 6_000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isActive).toBe(false);
    expect(res.json().priceCents).toBe(6_000);

    const after = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/properties/${propertyId}/services`,
      headers: { cookie },
    });
    expect(after.json().data.length).toBe(1);
  });

  it("answers 404 for a service of another property", async () => {
    const other = seedProperty(ctx, "Service Lodge");
    const adminCookie = await signIn(ctx, "catalog-admin@example.com");
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/properties/${other.property.id}/services/1`,
      headers: { cookie: adminCookie, "content-type": "application/json" },
      payload: { priceCents: 100 },
    });
    expect(res.statusCode).toBe(404);
  });
});
