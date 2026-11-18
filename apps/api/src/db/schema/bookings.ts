import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { bookingSources, bookingStatuses, rateTypes } from "@neoams/shared";
import { user } from "./auth";
import { guests } from "./guests";
import { timestamps } from "./helpers";
import { rooms } from "./rooms";

export const bookings = sqliteTable(
  "bookings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guestId: integer("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "restrict" }), // primary guest
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    bookingReferenceCode: text("booking_reference_code").notNull().unique(), // "NEOAMS-BK-..."
    status: text("status", { enum: bookingStatuses })
      .notNull()
      .default("pending"),
    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),
    // Room charges only. Service charges live in service_bookings.
    totalCostCents: integer("total_cost_cents").notNull(),
    depositRequiredCents: integer("deposit_required_cents")
      .notNull()
      .default(0),
    specialRequests: text("special_requests"),
    checkInDate: integer("check_in_date", { mode: "timestamp_ms" }).notNull(),
    checkOutDate: integer("check_out_date", { mode: "timestamp_ms" }).notNull(),
    rateType: text("rate_type", { enum: rateTypes })
      .notNull()
      .default("nightly"),
    holdExpiresAt: integer("hold_expires_at", { mode: "timestamp_ms" }), // null = never expires (desk bookings)
    source: text("source", { enum: bookingSources })
      .notNull()
      .default("walk_in"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }), // null = self-booked
    ...timestamps(),
  },
  (t) => [
    index("bookings_guest_idx").on(t.guestId),
    // serves the availability/overlap query
    index("bookings_room_dates_idx").on(
      t.roomId,
      t.checkInDate,
      t.checkOutDate,
    ),
    index("bookings_status_idx").on(t.status),
    index("bookings_created_by_idx").on(t.createdBy),
    check("bookings_dates_chk", sql`${t.checkOutDate} > ${t.checkInDate}`),
    check("bookings_people_chk", sql`${t.adults} >= 1 AND ${t.children} >= 0`),
    check(
      "bookings_money_chk",
      sql`${t.totalCostCents} >= 0 AND ${t.depositRequiredCents} >= 0 AND ${t.depositRequiredCents} <= ${t.totalCostCents}`,
    ),
  ],
);

export const additionalGuests = sqliteTable(
  "additional_guests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    guestId: integer("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("additional_guests_booking_guest_uq").on(
      t.bookingId,
      t.guestId,
    ),
    index("additional_guests_guest_idx").on(t.guestId),
  ],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(), // 1–5
    comment: text("comment"),
    hostResponse: text("host_response"),
    isPublished: integer("is_published", { mode: "boolean" })
      .notNull()
      .default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("reviews_booking_uq").on(t.bookingId),
    check("reviews_rating_chk", sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);
