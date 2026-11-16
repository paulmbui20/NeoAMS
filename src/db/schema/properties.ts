import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { propertyRoles } from "../enums";
import { user } from "./auth";
import { timestamps } from "./helpers";

export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // generated from name
  description: text("description"),
  country: text("country").notNull().default("kenya"),
  county: text("county").notNull(),
  town: text("town").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps(),
});

export const propertyStaff = sqliteTable(
  "property_staff",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: propertyRoles }).notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("property_staff_property_user_uq").on(t.propertyId, t.userId),
    index("property_staff_user_idx").on(t.userId),
  ],
);

export const propertyImages = sqliteTable(
  "property_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    altText: text("alt_text"),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("property_images_property_url_uq").on(t.propertyId, t.imageUrl),
    // at most one primary image per property
    uniqueIndex("property_images_primary_uq")
      .on(t.propertyId)
      .where(sql`${t.isPrimary} = 1`),
  ],
);

export const amenities = sqliteTable("amenities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(), // "WiFi", "Parking", "Pool", ...
  icon: text("icon"),
});

export const propertyAmenities = sqliteTable(
  "property_amenities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    amenityId: integer("amenity_id")
      .notNull()
      .references(() => amenities.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("property_amenities_property_amenity_uq").on(
      t.propertyId,
      t.amenityId,
    ),
    index("property_amenities_amenity_idx").on(t.amenityId),
  ],
);
