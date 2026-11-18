// src/services/billing.ts
import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import type { Actor } from "../core/actor";
import {
  ConflictError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "../core/errors";
import { normalizeCode } from "../core/normalize";
import { paged } from "../core/pagination";
import type { Conn, Db } from "../db";
import type { PaymentMethod } from "@neoams/shared";
import {
  bookings,
  guests,
  paymentOptions,
  payments,
  rooms,
  serviceBookings,
} from "../db/schema";
import type {
  CreatePaymentOptionInput,
  PaymentListInput,
  RefundInput,
  ReviewPaymentInput,
  UpdatePaymentOptionInput,
} from "@neoams/shared";
import type { AuditService } from "./audit";

type RecordInput = {
  bookingId: number;
  type: "deposit" | "payment" | "refund";
  status: "pending" | "succeeded";
  amountCents: number;
  paymentMethod: PaymentMethod;
  transactionReferenceCode?: string;
  proofMessage?: string;
  refundOfPaymentId?: number;
  reason?: string;
  recordedBy: string | null; // null = submitted by the guest
};

export const createBillingService = ({
  db,
  audit,
}: {
  db: Db;
  audit: AuditService;
}) => {
  /** tx-first. THE balance function. Only succeeded rows count. */
  const balance = (c: Conn, bookingId: number) => {
    const b = c
      .select({
        room: bookings.totalCostCents,
        deposit: bookings.depositRequiredCents,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .get();
    if (!b) throw new NotFoundError("Booking");
    const extras = c
      .select({
        n: sql<number>`coalesce(sum(${serviceBookings.subtotalCents}), 0)`,
      })
      .from(serviceBookings)
      .where(eq(serviceBookings.bookingId, bookingId))
      .get()!.n;
    const ledger = c
      .select({
        paid: sql<number>`coalesce(sum(case when ${payments.type} in ('deposit','payment') then ${payments.amountCents} end), 0)`,
        refunded: sql<number>`coalesce(sum(case when ${payments.type} = 'refund' then ${payments.amountCents} end), 0)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.bookingId, bookingId),
          eq(payments.status, "succeeded"),
        ),
      )
      .get()!;
    const netPaidCents = ledger.paid - ledger.refunded;
    const totalChargesCents = b.room + extras;
    return {
      currency: "KES",
      roomChargesCents: b.room,
      serviceChargesCents: extras,
      totalChargesCents,
      paidCents: ledger.paid,
      refundedCents: ledger.refunded,
      netPaidCents,
      balanceCents: totalChargesCents - netPaidCents,
      depositRequiredCents: b.deposit,
      depositMet: netPaidCents >= b.deposit,
    };
  };

  /** tx-first. Inserts one ledger row. Codes are normalised and may not be reused while live. */
  const record = (c: Conn, i: RecordInput) => {
    const ref = i.transactionReferenceCode
      ? normalizeCode(i.transactionReferenceCode)
      : null;
    if (
      ref &&
      c
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.transactionReferenceCode, ref),
            ne(payments.status, "failed"),
          ),
        )
        .get()
    ) {
      throw new ConflictError(
        "DUPLICATE_PAYMENT_REFERENCE",
        "This transaction code has already been submitted",
      );
    }
    return c
      .insert(payments)
      .values({
        bookingId: i.bookingId,
        type: i.type,
        status: i.status,
        amountCents: i.amountCents,
        paymentMethod: i.paymentMethod,
        transactionReferenceCode: ref,
        proofMessage: i.proofMessage ?? null,
        refundOfPaymentId: i.refundOfPaymentId ?? null,
        reason: i.reason ?? null,
        recordedBy: i.recordedBy,
      })
      .returning()
      .get();
  };

  /** tx-first. Property-scoped lookup so one property can never touch another's payments. */
  const findScoped = (c: Conn, propertyId: number, paymentId: number) => {
    const row = c
      .select({ payment: payments })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(rooms, eq(rooms.id, bookings.roomId))
      .where(and(eq(payments.id, paymentId), eq(rooms.propertyId, propertyId)))
      .get();
    if (!row) throw new NotFoundError("Payment");
    return row.payment;
  };

  return {
    balance,
    record,
    findScoped,

    /** tx-first. Atomic pending → succeeded/failed. Staff may correct the amount after checking the statement. */
    review(c: Conn, paymentId: number, input: ReviewPaymentInput) {
      const row = c
        .update(payments)
        .set({
          status: input.decision,
          ...(input.amountCents ? { amountCents: input.amountCents } : {}),
        })
        .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")))
        .returning()
        .get();
      if (!row)
        throw new InvalidStateError(
          "PAYMENT_NOT_PENDING",
          "Only pending payments can be reviewed",
        );
      return row;
    },

    refund(
      propertyId: number,
      paymentId: number,
      input: RefundInput,
      actor: Actor,
    ) {
      return db.transaction(
        (tx) => {
          const original = findScoped(tx, propertyId, paymentId);
          if (original.status !== "succeeded" || original.type === "refund") {
            throw new InvalidStateError(
              "NOT_REFUNDABLE",
              "Only successful payments can be refunded",
            );
          }
          const refunded = tx
            .select({
              n: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
            })
            .from(payments)
            .where(
              and(
                eq(payments.refundOfPaymentId, paymentId),
                eq(payments.status, "succeeded"),
              ),
            )
            .get()!.n;
          const left = original.amountCents - refunded;
          if (input.amountCents > left) {
            throw new ConflictError(
              "REFUND_EXCEEDS_PAYMENT",
              `Only KES ${(left / 100).toFixed(2)} of this payment is still refundable`,
            );
          }
          const row = record(tx, {
            bookingId: original.bookingId,
            type: "refund",
            status: "succeeded",
            amountCents: input.amountCents,
            paymentMethod: input.paymentMethod,
            transactionReferenceCode: input.transactionReferenceCode,
            refundOfPaymentId: paymentId,
            reason: input.reason,
            recordedBy: actor.userId,
          });
          audit.log(tx, {
            actor,
            action: "payment.refund",
            entity: "payment",
            entityId: row.id,
            after: { of: paymentId, amountCents: row.amountCents },
          });
          return { refund: row, balance: balance(tx, original.bookingId) };
        },
        { behavior: "immediate" },
      );
    },

    /** The review queue: `status=pending` shows guest-submitted proofs waiting for a human. */
    listPayments(propertyId: number, q: PaymentListInput) {
      const where = and(
        eq(rooms.propertyId, propertyId),
        q.status ? eq(payments.status, q.status) : undefined,
      );
      const joined = <T extends { innerJoin: Function }>(b: T) => b; // (kept inline below for type clarity)
      void joined;
      const total = db
        .select({ n: count() })
        .from(payments)
        .innerJoin(bookings, eq(bookings.id, payments.bookingId))
        .innerJoin(rooms, eq(rooms.id, bookings.roomId))
        .where(where)
        .get()!.n;
      const rows = db
        .select({
          id: payments.id,
          bookingId: payments.bookingId,
          bookingReference: bookings.bookingReferenceCode,
          guestName: sql<string>`${guests.firstName} || ' ' || ${guests.lastName}`,
          type: payments.type,
          status: payments.status,
          amountCents: payments.amountCents,
          paymentMethod: payments.paymentMethod,
          transactionReferenceCode: payments.transactionReferenceCode,
          proofMessage: payments.proofMessage,
          submittedByGuest: sql<boolean>`${payments.recordedBy} is null`,
          paymentDate: payments.paymentDate,
        })
        .from(payments)
        .innerJoin(bookings, eq(bookings.id, payments.bookingId))
        .innerJoin(rooms, eq(rooms.id, bookings.roomId))
        .innerJoin(guests, eq(guests.id, bookings.guestId))
        .where(where)
        .orderBy(desc(payments.id))
        .limit(q.limit)
        .offset(q.offset)
        .all();
      return paged(rows, total, q);
    },

    // ---- "how to pay" (owner-editable) ----
    listPaymentOptions: (propertyId: number, activeOnly = false) =>
      db
        .select()
        .from(paymentOptions)
        .where(
          and(
            eq(paymentOptions.propertyId, propertyId),
            activeOnly ? eq(paymentOptions.isActive, true) : undefined,
          ),
        )
        .orderBy(asc(paymentOptions.sortOrder), asc(paymentOptions.id))
        .all(),

    createPaymentOption(
      propertyId: number,
      input: CreatePaymentOptionInput,
      actor: Actor,
    ) {
      return db.transaction((tx) => {
        const row = tx
          .insert(paymentOptions)
          .values({ ...input, propertyId })
          .returning()
          .get();
        audit.log(tx, {
          actor,
          action: "payment_option.create",
          entity: "payment_option",
          entityId: row.id,
          after: row,
        });
        return row;
      });
    },

    updatePaymentOption(
      propertyId: number,
      optionId: number,
      input: UpdatePaymentOptionInput,
      actor: Actor,
    ) {
      if (Object.keys(input).length === 0)
        throw new ValidationError("Nothing to update");
      return db.transaction((tx) => {
        const before = tx
          .select()
          .from(paymentOptions)
          .where(
            and(
              eq(paymentOptions.id, optionId),
              eq(paymentOptions.propertyId, propertyId),
            ),
          )
          .get();
        if (!before) throw new NotFoundError("Payment option");
        const row = tx
          .update(paymentOptions)
          .set(input)
          .where(eq(paymentOptions.id, optionId))
          .returning()
          .get();
        audit.log(tx, {
          actor,
          action: "payment_option.update",
          entity: "payment_option",
          entityId: optionId,
          before,
          after: row,
        });
        return row;
      });
    },
  };
};
export type BillingService = ReturnType<typeof createBillingService>;
