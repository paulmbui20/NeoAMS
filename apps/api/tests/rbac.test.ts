// tests/rbac.test.ts
// The RBAC matrix, generated from the shared permission map.
// Every role is checked against every route: the answer must be 200 or 403,
// never a crash and never a leak.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  propertyRoles,
  rolePermissions,
  type Permission,
  type PropertyRole,
} from "@neoams/shared";
import {
  assignStaff,
  createTestCtx,
  createUser,
  signIn,
  type TestCtx,
} from "./helpers";

type RouteCase = {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  /** The permission the route requires, or null when it needs none. */
  permission: Permission | null;
  payload?: unknown;
};

const P = 1;

/**
 * Each route, with the permission it asks for. The expected answer comes
 * straight from rolePermissions, so the test and the app cannot disagree.
 */
const ROUTES: RouteCase[] = [
  {
    name: "today",
    method: "GET",
    url: `/api/v1/properties/${P}/today`,
    permission: "booking:read",
  },
  {
    name: "availability",
    method: "GET",
    url: `/api/v1/properties/${P}/availability?type=nightly&checkInDate=2027-05-01&checkOutDate=2027-05-02`,
    permission: "booking:read",
  },
  {
    name: "bookings list",
    method: "GET",
    url: `/api/v1/properties/${P}/bookings`,
    permission: "booking:read",
  },
  {
    name: "bookings create",
    method: "POST",
    url: `/api/v1/properties/${P}/bookings`,
    permission: "booking:write",
    payload: {
      roomId: 1,
      stay: {
        type: "nightly",
        checkInDate: "2027-05-01",
        checkOutDate: "2027-05-02",
      },
      guest: { firstName: "T", lastName: "U", phone: "+254700000999" },
    },
  },
  {
    name: "guests list",
    method: "GET",
    url: `/api/v1/properties/${P}/guests?q=Te`,
    permission: "guest:read",
  },
  {
    name: "guests create",
    method: "POST",
    url: `/api/v1/properties/${P}/guests`,
    permission: "guest:write",
    payload: { firstName: "New", lastName: "Guest", phone: "+254700000998" },
  },
  {
    name: "payments list",
    method: "GET",
    url: `/api/v1/properties/${P}/payments`,
    permission: "booking:read",
  },
  {
    name: "payment options list",
    method: "GET",
    url: `/api/v1/properties/${P}/payment-options`,
    permission: "booking:read",
  },
  {
    name: "payment options create",
    method: "POST",
    url: `/api/v1/properties/${P}/payment-options`,
    permission: "property:manage",
    payload: {
      kind: "bank_transfer",
      label: "Bank",
      accountNumber: "1",
      accountName: "A",
      instructions: "i",
      sortOrder: 1,
      isActive: true,
    },
  },
  {
    name: "property read",
    method: "GET",
    url: `/api/v1/properties/${P}`,
    permission: "booking:read",
  },
  {
    name: "property update",
    method: "PATCH",
    url: `/api/v1/properties/${P}`,
    permission: "property:manage",
    payload: { depositPercent: 40 },
  },
  {
    name: "staff list",
    method: "GET",
    url: `/api/v1/properties/${P}/staff`,
    permission: "staff:manage",
  },
  {
    name: "staff add",
    method: "POST",
    url: `/api/v1/properties/${P}/staff`,
    permission: "staff:manage",
    payload: {
      name: "S",
      email: "s@example.com",
      tempPassword: "TempPass1234!",
      role: "receptionist",
    },
  },
  {
    name: "room types list",
    method: "GET",
    url: `/api/v1/properties/${P}/room-types`,
    permission: "booking:read",
  },
  {
    name: "room types create",
    method: "POST",
    url: `/api/v1/properties/${P}/room-types`,
    permission: "catalog:manage",
    payload: { name: "Suite", pricePerNightCents: 100000 },
  },
  {
    name: "rooms list",
    method: "GET",
    url: `/api/v1/properties/${P}/rooms`,
    permission: "booking:read",
  },
  {
    name: "rooms create",
    method: "POST",
    url: `/api/v1/properties/${P}/rooms`,
    permission: "catalog:manage",
    payload: { roomTypeId: 1, roomNumber: "999" },
  },
  {
    name: "room status",
    method: "PATCH",
    url: `/api/v1/properties/${P}/rooms/1/status`,
    permission: "roomStatus:write",
    payload: { status: "dirty" },
  },
  {
    name: "amenities list",
    method: "GET",
    url: `/api/v1/properties/${P}/amenities`,
    permission: "booking:read",
  },
  {
    name: "amenities set",
    method: "PUT",
    url: `/api/v1/properties/${P}/amenities`,
    permission: "property:manage",
    payload: { amenityIds: [] },
  },
  {
    name: "services list",
    method: "GET",
    url: `/api/v1/properties/${P}/services`,
    permission: "booking:read",
  },
  {
    name: "services create",
    method: "POST",
    url: `/api/v1/properties/${P}/services`,
    permission: "catalog:manage",
    payload: { name: "Breakfast", priceCents: 5000 },
  },
  {
    name: "expenses list",
    method: "GET",
    url: `/api/v1/properties/${P}/expenses`,
    permission: "expense:manage",
  },
  {
    name: "expense categories",
    method: "GET",
    url: `/api/v1/properties/${P}/expense-categories`,
    permission: "expense:manage",
  },
  {
    name: "reports summary",
    method: "GET",
    url: `/api/v1/properties/${P}/reports/summary`,
    permission: "report:read",
  },
  {
    name: "reports revenue",
    method: "GET",
    url: `/api/v1/properties/${P}/reports/revenue`,
    permission: "report:read",
  },
  {
    name: "audit logs",
    method: "GET",
    url: `/api/v1/properties/${P}/audit-logs`,
    permission: "audit:read",
  },
  {
    name: "images list",
    method: "GET",
    url: `/api/v1/properties/${P}/images`,
    permission: "booking:read",
  },
];

describe("RBAC matrix", () => {
  let ctx: TestCtx;
  const cookies = new Map<string, string>();

  beforeAll(async () => {
    ctx = createTestCtx();
    // A property with a room type and a room, so the routes have something to read.
    const { property, roomType, room } = await import("./helpers").then((m) =>
      m.seedProperty(ctx),
    );
    expect(property.id).toBe(P);
    expect(roomType.id).toBe(1);
    expect(room.id).toBe(1);

    for (const role of propertyRoles) {
      const u = await createUser(ctx, {
        email: `${role}@example.com`,
        password: "Test1234#!",
        role: "user",
      });
      assignStaff(ctx, property.id, u.id, role);
      cookies.set(role, await signIn(ctx, `${role}@example.com`));
    }

    const admin = await createUser(ctx, {
      email: "global-admin@example.com",
      password: "Test1234#!",
      role: "admin",
    });
    cookies.set("admin", await signIn(ctx, "global-admin@example.com"));
    expect(admin.role).toBe("admin");
  });

  afterAll(async () => {
    await ctx.close();
  });

  for (const route of ROUTES) {
    for (const role of propertyRoles) {
      it(`${role} ${route.permission ?? "open"} → ${route.name}`, async () => {
        const res = await ctx.app.inject({
          method: route.method,
          url: route.url,
          headers: {
            cookie: cookies.get(role)!,
            ...(route.payload ? { "content-type": "application/json" } : {}),
          },
          ...(route.payload ? { payload: route.payload } : {}),
        });

        const allowed =
          route.permission === null
            ? true
            : rolePermissions[role].has(route.permission);

        if (allowed) {
          // A permitted request must not be refused for permission reasons.
          expect(res.statusCode).not.toBe(403);
        } else {
          expect(res.statusCode).toBe(403);
          expect(res.json().error.code).toBe("FORBIDDEN");
        }
      });
    }

    it(`global admin → ${route.name}`, async () => {
      const res = await ctx.app.inject({
        method: route.method,
        url: route.url,
        headers: {
          cookie: cookies.get("admin")!,
          ...(route.payload ? { "content-type": "application/json" } : {}),
        },
        ...(route.payload ? { payload: route.payload } : {}),
      });
      expect(res.statusCode).not.toBe(403);
    });
  }
});

describe("unauthenticated access", () => {
  let ctx: TestCtx;

  beforeAll(() => {
    ctx = createTestCtx();
  });

  afterAll(async () => {
    await ctx.close();
  });

  for (const route of ROUTES) {
    it(`refuses ${route.name} without a session`, async () => {
      const res = await ctx.app.inject({
        method: route.method,
        url: route.url,
        headers: route.payload ? { "content-type": "application/json" } : {},
        ...(route.payload ? { payload: route.payload } : {}),
      });
      expect(res.statusCode).toBe(401);
    });
  }
});

describe("a user with no role at the property", () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = createTestCtx();
    await import("./helpers").then((m) => m.seedProperty(ctx));
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("is refused at every property route", async () => {
    const u = await createUser(ctx, {
      email: "outsider@example.com",
      password: "Test1234#!",
    });
    const cookie = await signIn(ctx, "outsider@example.com");
    for (const route of ROUTES) {
      const res = await ctx.app.inject({
        method: route.method,
        url: route.url,
        headers: {
          cookie,
          ...(route.payload ? { "content-type": "application/json" } : {}),
        },
        ...(route.payload ? { payload: route.payload } : {}),
      });
      expect(res.statusCode).toBe(403);
    }
  });
});
