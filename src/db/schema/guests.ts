import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { genders, idTypes } from "../enums";
import { user } from "./auth";
import { timestamps } from "./helpers";

export const guests = sqliteTable(
  "guests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }), // null for walk-ins
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone").notNull(),
    country: text("country"),
    nationality: text("nationality"),
    idType: text("id_type", { enum: idTypes }),
    idNumber: text("id_number"), // normalise (trim/uppercase) in the API
    dateOfBirth: text("date_of_birth"), // YYYY-MM-DD
    gender: text("gender", { enum: genders }),
    address: text("address"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("guests_user_uq").on(t.userId),
    uniqueIndex("guests_id_uq").on(t.idType, t.idNumber),
    check(
      "guests_id_pair_chk",
      sql`(${t.idType} IS NULL) = (${t.idNumber} IS NULL)`,
    ),
    index("guests_phone_idx").on(t.phone),
    index("guests_email_idx").on(t.email),
  ],
);
