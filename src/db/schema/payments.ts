import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import {
  paymentMethods,
  paymentOptionKinds,
  paymentStatuses,
  paymentTypes,
} from "../enums";
import { user } from "./auth";
import { bookings } from "./bookings";
import { nowMs, timestamps } from "./helpers";
import { properties } from "./properties";

// Single money ledger. Amounts are always positive; `type` gives the direction:
//   deposit / payment → money in,  refund → money out.
export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    type: text("type", { enum: paymentTypes }).notNull().default("payment"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("KES"),
    paymentMethod: text("payment_method", { enum: paymentMethods })
      .notNull()
      .default("cash"),
    // M-Pesa receipt code, bank ref, etc. Unique so a callback can't be applied twice.
    transactionReferenceCode: text("transaction_reference_code"),
    proofMessage: text("proof_message"), // pasted M-Pesa confirmation SMS

    status: text("status", { enum: paymentStatuses })
      .notNull()
      .default("pending"),
    refundOfPaymentId: integer("refund_of_payment_id").references(
      (): AnySQLiteColumn => payments.id,
      {
        onDelete: "restrict",
      },
    ),
    reason: text("reason"),
    paymentDate: integer("payment_date", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
    recordedBy: text("recorded_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    index("payments_booking_idx").on(t.bookingId),
    index("payments_status_idx").on(t.status),
    index("payments_recorded_by_idx").on(t.recordedBy),
    check("payments_amount_chk", sql`${t.amountCents} > 0`),
    uniqueIndex("payments_txn_ref_uq")
      .on(t.transactionReferenceCode)
      .where(sql`${t.status} <> 'failed'`),
  ],
);

export const paymentOptions = sqliteTable(
  "payment_options",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: paymentOptionKinds }).notNull(),
    label: text("label").notNull(), // "Pay via M-Pesa Till"
    accountNumber: text("account_number"), // till / paybill / bank account
    accountName: text("account_name"), // name shown on the M-Pesa prompt
    instructions: text("instructions"), // free text: "Use your booking reference as the account number"
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (t) => [index("payment_options_property_idx").on(t.propertyId, t.isActive)],
);
