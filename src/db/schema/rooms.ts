import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { roomStatuses } from "../enums";
import { amenities, properties } from "./properties";
import { timestamps } from "./helpers";

export const roomTypes = sqliteTable(
  "room_types",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // "Single", "Deluxe", "Suite"...
    slug: text("slug").notNull(), // public URL, unique per property
    description: text("description"),
    pricePerNightCents: integer("price_per_night_cents").notNull(),
    pricePerHourCents: integer("price_per_hour_cents"),
    maxOccupancy: integer("max_occupancy").notNull().default(2),
    bedConfiguration: text("bed_configuration"), // "1 King", "2 Twin"
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("room_types_property_slug_uq").on(t.propertyId, t.slug),
    check("room_types_night_price_chk", sql`${t.pricePerNightCents} >= 0`),
    check(
      "room_types_hour_price_chk",
      sql`${t.pricePerHourCents} IS NULL OR ${t.pricePerHourCents} >= 0`,
    ),
    check("room_types_occupancy_chk", sql`${t.maxOccupancy} >= 1`),
  ],
);

export const roomTypeImages = sqliteTable(
  "room_type_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomTypeId: integer("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    altText: text("alt_text"),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("room_type_images_type_url_uq").on(t.roomTypeId, t.imageUrl),
    uniqueIndex("room_type_images_primary_uq")
      .on(t.roomTypeId)
      .where(sql`${t.isPrimary} = 1`),
  ],
);

export const roomTypeAmenities = sqliteTable(
  "room_type_amenities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomTypeId: integer("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    amenityId: integer("amenity_id")
      .notNull()
      .references(() => amenities.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("room_type_amenities_type_amenity_uq").on(
      t.roomTypeId,
      t.amenityId,
    ),
    index("room_type_amenities_amenity_idx").on(t.amenityId),
  ],
);

export const rooms = sqliteTable(
  "rooms",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    roomTypeId: integer("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "restrict" }),
    roomNumber: text("room_number").notNull(), // "101A", "Penthouse-B"
    floor: text("floor"),
    description: text("description"),
    // Physical state. Bookability for a date range comes from bookings, not from this.
    status: text("status", { enum: roomStatuses })
      .notNull()
      .default("available"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("rooms_property_number_uq").on(t.propertyId, t.roomNumber),
    index("rooms_property_status_idx").on(t.propertyId, t.status),
    index("rooms_type_idx").on(t.roomTypeId),
  ],
);
