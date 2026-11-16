import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { paymentMethods, paymentStatuses, paymentTypes } from "../enums";
import { user } from "./auth";
import { bookings } from "./bookings";
import { nowMs, timestamps } from "./helpers";

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
    transactionReferenceCode: text("transaction_reference_code").unique(),
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
  ],
);
