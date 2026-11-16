import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { bookings } from "./bookings";
import { timestamps } from "./helpers";
import { properties } from "./properties";

export const services = sqliteTable(
  "services",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("services_property_slug_uq").on(t.propertyId, t.slug),
    index("services_active_idx").on(t.isActive),
    check("services_price_chk", sql`${t.priceCents} >= 0`),
  ],
);

export const serviceBookings = sqliteTable(
  "service_bookings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    // restrict: deleting a service must never erase past bills. Use isActive to retire it.
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull(), // snapshot at time of sale
    subtotalCents: integer("subtotal_cents").notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("service_bookings_booking_idx").on(t.bookingId),
    index("service_bookings_service_idx").on(t.serviceId),
    check("service_bookings_qty_chk", sql`${t.quantity} > 0`),
    check(
      "service_bookings_subtotal_chk",
      sql`${t.subtotalCents} = ${t.quantity} * ${t.unitPriceCents}`,
    ),
  ],
);
