import { defineRelations, sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";

// ==========================================
// COMMON TYPES
// ==========================================

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date());

// ==========================================
// BETTER AUTH TABLES
// ==========================================

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),

  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),

  image: text("image"),

  role: text("role", {
    enum: [
      "admin",
      "owner",
      "manager",
      "receptionist",
      "accountant",
      "staff",
      "guest",
    ],
  })
    .default("guest")
    .notNull(),

  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),

    createdAt: createdAt(),
    updatedAt: updatedAt(),

    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),

    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),

    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),

    scope: text("scope"),
    password: text("password"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const relations = defineRelations(
  {
    user,
    session,
    account,
  },
  (r) => ({
    user: {
      sessions: r.many.session(),
      accounts: r.many.account(),
    },

    session: {
      user: r.one.user({
        from: r.session.userId,
        to: r.user.id,
      }),
    },

    account: {
      user: r.one.user({
        from: r.account.userId,
        to: r.user.id,
      }),
    },
  }),
);

// ==========================================
// 1. PROPERTIES
// ==========================================

export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(), // auto generated from name
  description: text("description"),
  country: text("country").notNull().default("kenya"),
  county: text("county").notNull(),
  town: text("town").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  locationCoordinates: text("location_coordinates"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),

  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ==========================================
// 2. PROPERTY IMAGES
// ==========================================

export const propertyImages = sqliteTable(
  "property_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id),

    imageUrl: text("image_url").notNull(),
    altText: text("alt_text"),

    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("prop_img_uniq_idx").on(table.propertyId, table.imageUrl),
    index("prop_img_prop_idx").on(table.propertyId),
  ],
);

// ==========================================
// 3. AMENITIES
// ==========================================

export const amenities = sqliteTable("amenities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // "WiFi", "Balcony", "Parking", "Air Conditioning", "Elevator", "Gym", "Pool", "Kitchen", "Laundry"
  icon: text("icon"),
});

// ==========================================
// 4. PROPERTY AMENITIES
// ==========================================

export const propertyAmenities = sqliteTable(
  "property_amenities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id),

    amenityId: integer("amenity_id")
      .notNull()
      .references(() => amenities.id),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("prop_amnty_uniq_idx").on(table.propertyId, table.amenityId),
    index("prop_amnty_prop_idx").on(table.propertyId),
    index("prop_amnty_amnty_idx").on(table.amenityId),
  ],
);

// ==========================================
// 5. ROOM TYPES
// ==========================================

export const roomTypes = sqliteTable(
  "room_types",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),

    name: text("name").notNull(), // "Single", "Double", "Suite", "Deluxe", "Executive", "Family", "Studio", "Penthouse"

    description: text("description"),
    pricePerNightCents: integer("price_per_night_cents").notNull(), // or 12 hours
    pricePerHourCents: integer("price_per_hour_cents"),
    maxOccupancy: integer("max_occupancy").notNull().default(2),
    bedConfiguration: text("bed_configuration"), // "1 King", "2 Twin"
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),

    availableRooms: integer("available_rooms").notNull(), // Number of such available rooms in the property eg. 5

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("rm_typ_prop_idx").on(table.propertyId)],
);

// ==========================================
// 6. ROOMS
// ==========================================

export const room = sqliteTable(
  "rooms",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),

    roomTypeId: integer("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "restrict" }),

    roomNumber: integer("room_number").notNull(),
    floor: text("floor"),
    description: text("description"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("rm_uniq_idx").on(table.propertyId, table.roomNumber),
    index("rm_prop_idx").on(table.propertyId),
    index("rm_typ_idx").on(table.roomTypeId),
  ],
);

// ==========================================
// 7. ROOM IMAGES
// ==========================================

export const roomImages = sqliteTable(
  "room_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    roomId: integer("room_id")
      .notNull()
      .references(() => room.id),

    imageUrl: text("image_url").notNull(),
    altText: text("alt_text"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("rm_img_uniq_idx").on(table.roomId, table.imageUrl),
    index("rm_img_rm_idx").on(table.roomId),
  ],
);

// ==========================================
// 8. ROOM TYPE AMENITIES
// ==========================================

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

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("rm_typ_amty_uniq_idx").on(table.roomTypeId, table.amenityId),
    index("rm_typ_amty_rm_idx").on(table.roomTypeId),
    index("rm_typ_amty_amnty_idx").on(table.amenityId),
  ],
);

// ==========================================
// 9. GUESTS
// ==========================================

export const guests = sqliteTable("guests", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  userId: integer("user_id").references(() => user.id, {
    onDelete: "set null",
  }), // null if the guest is not a user(not doing self service check-in), or if the user is deleted

  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name").notNull(),
  email: text("email").unique(),
  phone: text("phone").notNull().unique(),
  country: text("country"), // country of origin
  nationality: text("nationality"), // nationality

  idType: text("id_type", {
    enum: ["national_id", "passport", "drivers_license", "other"],
  })
    .notNull()
    .default("national_id"), // "National ID", "Passport", "Driver's License", "Other"

  idNumber: text("id_number").notNull().unique(),

  age: integer("age"), // calculated from date of birth
  dateOfBirth: text("date_of_birth"), // date of birth in yyyy-mm-dd format

  gender: text("gender", {
    enum: ["male", "female", "other"],
  })
    .notNull()
    .default("male"), // gender either male, female or other

  isPrimaryGuest: integer("is_primary_guest", { mode: "boolean" })
    .notNull()
    .default(true),

  address: text("address"),
  notes: text("notes"),

  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ==========================================
// 10. BOOKINGS
// ==========================================

export const bookings = sqliteTable(
  "bookings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    guestId: integer("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "restrict" }),

    roomId: integer("room_id")
      .notNull()
      .references(() => room.id, { onDelete: "restrict" }),

    bookingReferenceCode: text("booking_reference_code").notNull().unique(), // autogenerated alphanumeric code with prefix "NEOAMS-BK-" eg "NEOAMS-BK-1234567890" that is unique for each booking

    status: text("status", {
      enum: [
        "pending",
        "confirmed",
        "checked_in",
        "checked_out",
        "cancelled",
        "no_show",
      ],
    })
      .notNull()
      .default("pending"),

    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),

    totalCostCents: integer("total_cost_cents").notNull(),
    depositRequiredCents: integer("deposit_required_cents").notNull(),

    specialRequests: text("special_requests"),

    checkInDate: integer("check_in_date", { mode: "timestamp_ms" }).notNull(),
    checkOutDate: integer("check_out_date", { mode: "timestamp_ms" }).notNull(),

    source: text("source", {
      enum: ["website", "phone", "walk_in", "social_media", "other"],
    })
      .notNull()
      .default("walk_in"),

    createdBy: integer("created_by").references(() => user.id, {
      onDelete: "set null",
    }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("bkngs_gst_idx").on(table.guestId),
    index("bkngs_rm_idx").on(table.roomId),
    index("bkngs_bk_rf_code_idx").on(table.bookingReferenceCode),
    index("bkngs_stts_idx").on(table.status),
    index("bkngs_dates_idx").on(table.checkInDate, table.checkOutDate),
  ],
);

// ==========================================
// 11. ADDITIONAL BOOKING GUESTS
// ==========================================

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

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("addtl_gsts_bk_gst_uniq_idx").on(
      table.bookingId,
      table.guestId,
    ),
    index("addtl_gsts_bk_idx").on(table.bookingId),
    index("addtl_gsts_gst_idx").on(table.guestId),
  ],
);

// ==========================================
// 12. PAYMENTS
// ==========================================

export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),

    type: text("type", { enum: ["deposit", "payment", "refund"] })
      .notNull()
      .default("payment"),

    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("KES"),

    paymentMethod: text("payment_method", {
      enum: [
        "card",
        "cash",
        "bank_transfer",
        "mpesa",
        "airtel_money",
        "paypal",
        "stripe",
        "crypto",
        "other",
      ],
    })
      .notNull()
      .default("cash"),

    transactionReferenceCode: text("transaction_reference_code").unique(), // auto generated unique alphanumeric code with prefix "NEOAMS-TRX-" eg "NEOAMS-TRX-1234567890" that is unique for each payment

    status: text("status", {
      enum: ["pending", "succeeded", "failed", "refunded"],
    })
      .notNull()
      .default("pending"),

    paymentDate: integer("payment_date", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),

    recordedBy: integer("recorded_by").references(() => user.id, {
      onDelete: "set null",
    }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("pmts_bk_idx").on(table.bookingId),
    index("pmts_stts_idx").on(table.status),
  ],
);

// ==========================================
// 13. REFUNDS
// ==========================================

export const refunds = sqliteTable(
  "refunds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    paymentId: integer("payment_id")
      .notNull()
      .references(() => payments.id),

    amount: integer("amount").notNull(),

    reason: text("reason"),

    status: text("status", {
      enum: ["pending", "completed", "failed"],
    })
      .notNull()
      .default("pending"),

    refundedAt: integer("refunded_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("rfds_stts_idx").on(table.status),
    index("rfds_pmts_id_idx").on(table.paymentId),
    check("rfds_amt_chk", sql`${table.amount} > 0`),
    uniqueIndex("rfds_pmts_id_uq").on(table.paymentId),
  ],
);

// ==========================================
// 14. REVIEWS
// ==========================================

export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),

    guestId: integer("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),

    rating: integer("rating").notNull(), // 1–5
    comment: text("comment"),
    hostResponse: text("host_response"),

    isPublished: integer("is_published", { mode: "boolean" })
      .notNull()
      .default(true),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("revws_bkng_uq").on(table.bookingId),
    check("revws_rtng_chk", sql`${table.rating} BETWEEN 1 AND 5`),
  ],
);

// ==========================================
// 15. SERVICES
// ==========================================

export const services = sqliteTable(
  "services",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),

    name: text("name").notNull(),

    slug: text("slug").unique().notNull(),

    description: text("description"),

    price: integer("price").notNull(),

    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("svcs_slug_uq").on(table.slug),
    check("svcs_price_chk", sql`${table.price} > 0`),
    index("svcs_prop_id_idx").on(table.propertyId),
    index("svcs_slug_idx").on(table.slug),
    index("svcs_actv_idx").on(table.isActive),
  ],
);

// ==========================================
// 16. SERVICE BOOKINGS
// ==========================================

export const serviceBookings = sqliteTable(
  "service_bookings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),

    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),

    quantity: integer("quantity").notNull().default(1),

    unitPrice: integer("unit_price").notNull(),

    subtotal: integer("subtotal").notNull(),

    notes: text("notes"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("svcs_bkngs_qty_chk", sql`${table.quantity} > 0`),
    index("svcs_bkngs_bk_id_idx").on(table.bookingId),
    index("svcs_bkngs_svc_id_idx").on(table.serviceId),
  ],
);

// ==========================================
// 17. EXPENSE CATEGORIES
// ==========================================

export const expenseCategories = sqliteTable("expense_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  name: text("name").notNull().unique(),

  description: text("description"),
});

// ==========================================
// 18. EXPENSES
// ==========================================

export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id),

    categoryId: integer("category_id")
      .notNull()
      .references(() => expenseCategories.id),

    description: text("description").notNull(),

    amount: integer("amount").notNull(),

    paymentMethod: text("payment_method"),

    reference: text("reference"),

    expenseDate: text("expense_date").notNull(),

    notes: text("notes"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("exps_prop_date_idx").on(table.propertyId, table.expenseDate),
  ],
);

// ==========================================
// 19. AUDIT LOGS
// ==========================================

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    userId: integer("user_id").references(() => user.id, {
      onDelete: "set null",
    }),

    action: text("action").notNull(),

    entity: text("entity").notNull(),

    entityId: integer("entity_id"),

    oldValues: text("old_values"),

    newValues: text("new_values"),

    ipAddress: text("ip_address"),

    createdAt: createdAt(),
  },
  (table) => [
    index("audit_user_idx").on(table.userId),
    index("audit_entity_idx").on(table.entity, table.entityId),
  ],
);
