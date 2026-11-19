// tests/shared.test.ts
// Unit tests for the shared package: validators, pricing and the permission map.
import { describe, expect, it } from "bun:test";
import * as s from "superstruct";
import {
  AddStaff,
  AvailabilityQuery,
  CreateExpense,
  CreateProperty,
  CreateRoomType,
  MAX_HOURS,
  MAX_NIGHTS,
  UpdateBooking,
  YmdDate,
  permissions,
  resolveStay,
  rolePermissions,
} from "@neoams/shared";

/**
 * superstruct's `validate` reports failures, `assert` throws them.
 * `create` is used rather than `assert` because it also applies coercion and
 * defaults, which is exactly what the API does when it parses a payload.
 */
const accepts = (struct: s.Struct<any, any>, value: unknown) => {
  expect(() => s.create(value, struct)).not.toThrow();
};
const rejects = (struct: s.Struct<any, any>, value: unknown) => {
  expect(() => s.create(value, struct)).toThrow();
};

describe("date validation", () => {
  it("accepts a real calendar date", () => {
    accepts(YmdDate, "2027-01-10");
  });

  it("rejects a date that does not exist", () => {
    rejects(YmdDate, "2027-02-30");
  });

  it("rejects a datetime where a date is expected", () => {
    rejects(YmdDate, "2027-01-10T00:00:00Z");
  });
});

describe("resolveStay", () => {
  const schedule = { checkInTime: "14:00", checkOutTime: "10:00" };

  it("counts nights between two calendar dates", () => {
    const stay = resolveStay(
      {
        type: "nightly",
        checkInDate: "2027-01-10",
        checkOutDate: "2027-01-13",
      },
      schedule,
    );
    expect(stay.units).toBe(3);
    expect(stay.rateType).toBe("nightly");
  });

  it("treats back-to-back dates as one night", () => {
    const stay = resolveStay(
      {
        type: "nightly",
        checkInDate: "2027-01-10",
        checkOutDate: "2027-01-11",
      },
      schedule,
    );
    expect(stay.units).toBe(1);
  });

  it("refuses a stay in the past", () => {
    expect(() =>
      resolveStay(
        {
          type: "nightly",
          checkInDate: "2027-01-10",
          checkOutDate: "2027-01-09",
        },
        schedule,
      ),
    ).toThrow();
  });

  it("refuses a stay longer than the maximum", () => {
    const checkIn = "2027-01-01";
    const checkOut = "2027-04-01";
    expect(() =>
      resolveStay(
        { type: "nightly", checkInDate: checkIn, checkOutDate: checkOut },
        schedule,
      ),
    ).toThrow();
  });

  it("adds hours for an hourly stay", () => {
    const checkIn = new Date("2027-01-10T11:00:00.000Z");
    const stay = resolveStay({ type: "hourly", checkIn, hours: 3 }, schedule);
    expect(stay.units).toBe(3);
    expect(stay.checkOut.getTime() - stay.checkIn.getTime()).toBe(3 * 3600_000);
  });
});

describe("limits", () => {
  it("caps hourly stays", () => {
    expect(MAX_HOURS).toBe(12);
  });
  it("caps nightly stays", () => {
    expect(MAX_NIGHTS).toBe(60);
  });
});

describe("permission map", () => {
  it("gives the owner every permission", () => {
    expect(rolePermissions.owner.size).toBe(permissions.length);
  });

  it("keeps payment options owner-only", () => {
    // property:manage covers payment options and till numbers.
    expect(rolePermissions.owner.has("property:manage")).toBe(true);
    for (const role of [
      "manager",
      "receptionist",
      "accountant",
      "staff",
    ] as const) {
      expect(rolePermissions[role].has("property:manage")).toBe(false);
    }
  });

  it("gives a receptionist the desk but not the money", () => {
    expect(rolePermissions.receptionist.has("booking:write")).toBe(true);
    expect(rolePermissions.receptionist.has("payment:write")).toBe(true);
    expect(rolePermissions.receptionist.has("payment:refund")).toBe(false);
    expect(rolePermissions.receptionist.has("expense:manage")).toBe(false);
  });

  it("gives an accountant money but not the desk", () => {
    expect(rolePermissions.accountant.has("payment:refund")).toBe(true);
    expect(rolePermissions.accountant.has("expense:manage")).toBe(true);
    expect(rolePermissions.accountant.has("report:read")).toBe(true);
    expect(rolePermissions.accountant.has("booking:write")).toBe(false);
  });

  it("gives a housekeeper only room status", () => {
    expect([...rolePermissions.staff]).toEqual(["roomStatus:write"]);
  });

  it("keeps staff management away from the manager", () => {
    expect(rolePermissions.manager.has("staff:manage")).toBe(false);
    expect(rolePermissions.owner.has("staff:manage")).toBe(true);
  });
});

describe("availability query", () => {
  it("accepts a nightly query", () => {
    accepts(AvailabilityQuery, {
      type: "nightly",
      checkInDate: "2027-01-10",
      checkOutDate: "2027-01-12",
    });
  });

  it("accepts an hourly query", () => {
    accepts(AvailabilityQuery, {
      type: "hourly",
      checkIn: "2027-01-10T14:00:00+03:00",
      hours: 3,
    });
  });

  it("rejects a query with no type", () => {
    rejects(AvailabilityQuery, {});
  });
});

describe("management payloads", () => {
  it("requires an owner when creating a property", () => {
    rejects(CreateProperty, {
      name: "Lodge",
      county: "Nairobi",
      town: "Nairobi",
    });
  });

  it("accepts a property with a new owner", () => {
    accepts(CreateProperty, {
      name: "Lodge",
      county: "Nairobi",
      town: "Nairobi",
      owner: {
        name: "Owner",
        email: "o@example.com",
        tempPassword: "Temp1234#!",
      },
    });
  });

  it("requires a nightly price on a room type", () => {
    rejects(CreateRoomType, { name: "Suite" });
    accepts(CreateRoomType, { name: "Suite", pricePerNightCents: 100000 });
  });

  it("keeps the party size within bounds", () => {
    rejects(UpdateBooking, { adults: 0 });
    rejects(UpdateBooking, { adults: 21 });
    accepts(UpdateBooking, { adults: 2, children: 0 });
  });

  it("requires a positive amount on an expense", () => {
    rejects(CreateExpense, {
      categoryId: 1,
      description: "Supplies",
      amountCents: 0,
      expenseDate: "2027-01-10",
    });
  });

  it("accepts staff addition in both forms", () => {
    accepts(AddStaff, { userId: "abc", role: "receptionist" });
    accepts(AddStaff, {
      name: "New",
      email: "n@example.com",
      tempPassword: "Temp1234#!",
      role: "manager",
    });
  });
});
