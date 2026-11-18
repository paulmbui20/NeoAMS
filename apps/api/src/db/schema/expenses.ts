import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { paymentMethods } from "@neoams/shared";
import { user } from "./auth";
import { timestamps } from "./helpers";
import { properties } from "./properties";

export const expenseCategories = sqliteTable("expense_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
});

export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // restrict: accounting records must outlive any attempt to delete a property
    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "restrict" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => expenseCategories.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paymentMethod: text("payment_method", { enum: paymentMethods }),
    reference: text("reference"),
    expenseDate: text("expense_date").notNull(), // YYYY-MM-DD (Africa/Nairobi calendar date)
    notes: text("notes"),
    recordedBy: text("recorded_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    index("expenses_property_date_idx").on(t.propertyId, t.expenseDate),
    index("expenses_category_idx").on(t.categoryId),
    check("expenses_amount_chk", sql`${t.amountCents} > 0`),
  ],
);
