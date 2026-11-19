// src/services/booking.ts
import {
  and,
  count,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { asc } from "drizzle-orm";
import { SYSTEM, type Actor } from "../core/actor";
import type { Clock } from "../core/clock";
import {
  ConflictError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from "../core/errors";
import { normalizeCode, normalizePhone } from "../core/normalize";
import { paged } from "../core/pagination";
import {
  assertNotPast,
  priceStay,
  resolveStay,
  type ResolvedStay,
} from "@neoams/shared";
import type { Conn, Db, Tx } from "../db";
import type { BookingSource, BookingStatus } from "@neoams/shared";
import {
  additionalGuests,
  bookings,
  guests,
  payments,
  properties,
  roomTypes,
  rooms,
  serviceBookings,
  services,
} from "../db/schema";
import type {
  ProofInput,
  RecordPaymentInput,
  ReviewPaymentInput,
} from "@neoams/shared";
import type {
  BookingListInput,
  DeskBookingInput,
  MyBookingsInput,
  OnlineBookingInput,
} from "@neoams/shared";
import type { AvailabilityService } from "./availability";
import { UNBOOKABLE } from "./availability";
import type { AuditService } from "./audit";
import type { BillingService } from "./billing";
import type { GuestService } from "./guest";

type BookingRow = typeof bookings.$inferSelect;
type RoomRow = typeof rooms.$inferSelect;
type RoomTypeRow = typeof roomTypes.$inferSelect;
type Scoped = { booking: BookingRow; room: RoomRow };

/** Who is asking: a phone number that matches the booking's guest, or their signed-in account. */
export type GuestAccess = { reference: string } & (
  { phone: string } | { userId: string }
);

type Deps = {
  db: Db;
  clock: Clock;
  audit: AuditService;
  availability: AvailabilityService;
  guest: GuestService;
  billing: BillingService;
  config: { holdMinutes: number; proofHoldHours: number };
};

// The whole state machine, in one table.
const TRANSITIONS = {
  confirm: { from: ["pending"], to: "confirmed" },
  checkIn: { from: ["confirmed"], to: "checked_in" },
  checkOut: { from: ["checked_in"], to: "checked_out" },
  noShow: { from: ["confirmed"], to: "no_show" },
  cancel: { from: ["pending", "confirmed"], to: "cancelled" },
} as const satisfies Record<
  string,
  { from: readonly BookingStatus[]; to: BookingStatus }
>;
export type Transition = keyof typeof TRANSITIONS;

const MAX_PROOFS = 3;
const IMMEDIATE = { behavior: "immediate" } as const;
const HOUR = 3_600_000;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L: guests read these over the phone
const newReference = () =>
  "BK-" +
  Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (b) => ALPHABET[b % ALPHABET.length],
  ).join("");

export const createBookingService = ({
  db,
  clock,
  audit,
  availability,
  guest,
  billing,
  config,
}: Deps) => {
  // ---------- loading ----------
  const loadScoped = (
    c: Conn,
    propertyId: number,
    bookingId: number,
  ): Scoped => {
    const row = c
      .select({ booking: bookings, room: rooms })
      .from(bookings)
      .innerJoin(rooms, eq(rooms.id, bookings.roomId))
      .where(and(eq(bookings.id, bookingId), eq(rooms.propertyId, propertyId)))
      .get();
    if (!row) throw new NotFoundError("Booking");
    return row;
  };

  const loadForGuest = (c: Conn, access: GuestAccess) => {
    const row = c
      .select({
        booking: bookings,
        guest: guests,
        room: rooms,
        roomType: roomTypes,
        property: properties,
      })
      .from(bookings)
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .innerJoin(rooms, eq(rooms.id, bookings.roomId))
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .innerJoin(properties, eq(properties.id, rooms.propertyId))
      .where(eq(bookings.bookingReferenceCode, normalizeCode(access.reference)))
      .get();
    const ok =
      row &&
      ("userId" in access
        ? row.guest.userId === access.userId
        : row.guest.phone === normalizePhone(access.phone));
    if (!ok) throw new NotFoundError("Booking"); // same answer for "no such booking" and "wrong phone"
    return row;
  };

  const getDetail = (c: Conn, propertyId: number, bookingId: number) => {
    const row = c
      .select({
        booking: bookings,
        guest: guests,
        room: rooms,
        roomType: roomTypes,
      })
      .from(bookings)
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .innerJoin(rooms, eq(rooms.id, bookings.roomId))
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .where(and(eq(bookings.id, bookingId), eq(rooms.propertyId, propertyId)))
      .get();
    if (!row) throw new NotFoundError("Booking");
    return {
      ...row,
      additionalGuests: c
        .select({
          id: guests.id,
          firstName: guests.firstName,
          lastName: guests.lastName,
          phone: guests.phone,
        })
        .from(additionalGuests)
        .innerJoin(guests, eq(guests.id, additionalGuests.guestId))
        .where(eq(additionalGuests.bookingId, bookingId))
        .all(),
      services: c
        .select({
          id: serviceBookings.id,
          name: services.name,
          quantity: serviceBookings.quantity,
          unitPriceCents: serviceBookings.unitPriceCents,
          subtotalCents: serviceBookings.subtotalCents,
        })
        .from(serviceBookings)
        .innerJoin(services, eq(services.id, serviceBookings.serviceId))
        .where(eq(serviceBookings.bookingId, bookingId))
        .all(),
      payments: c
        .select()
        .from(payments)
        .where(eq(payments.bookingId, bookingId))
        .orderBy(asc(payments.id))
        .all(),
      balance: billing.balance(c, bookingId),
    };
  };

  /** What a guest may see: no staff notes, no internal ids, only active payment options while money is due. */
  const guestView = (c: Conn, row: ReturnType<typeof loadForGuest>) => {
    const { booking, roomType, property } = row;
    const balance = billing.balance(c, booking.id);
    const owing =
      (booking.status === "pending" || booking.status === "confirmed") &&
      balance.balanceCents > 0;
    return {
      reference: booking.bookingReferenceCode,
      status: booking.status,
      property: {
        name: property.name,
        slug: property.slug,
        phone: property.phone,
        town: property.town,
        address: property.address,
      },
      roomType: roomType.name,
      rateType: booking.rateType,
      adults: booking.adults,
      children: booking.children,
      checkIn: booking.checkInDate,
      checkOut: booking.checkOutDate,
      holdExpiresAt: booking.holdExpiresAt,
      currency: "KES",
      totalCostCents: booking.totalCostCents,
      depositRequiredCents: booking.depositRequiredCents,
      balance,
      payments: c
        .select({
          type: payments.type,
          status: payments.status,
          amountCents: payments.amountCents,
          paymentMethod: payments.paymentMethod,
          transactionReferenceCode: payments.transactionReferenceCode,
          paymentDate: payments.paymentDate,
        })
        .from(payments)
        .where(eq(payments.bookingId, booking.id))
        .orderBy(asc(payments.id))
        .all(),
      paymentOptions: owing
        ? billing.listPaymentOptions(property.id, true)
        : [],
    };
  };

  // ---------- state machine ----------
  const applyTransition = (
    tx: Tx,
    t: Transition,
    { booking, room }: Scoped,
    actor: Actor,
    now: Date,
    reason?: string,
  ) => {
    const rule = TRANSITIONS[t];
    if (!(rule.from as readonly BookingStatus[]).includes(booking.status)) {
      throw new InvalidStateError(
        "INVALID_TRANSITION",
        `Cannot ${t} a booking that is ${booking.status}`,
      );
    }
    if (
      t === "confirm" &&
      !availability.isRoomFree(tx, {
        roomId: room.id,
        checkIn: booking.checkInDate,
        checkOut: booking.checkOutDate,
        now,
        excludeBookingId: booking.id,
      })
    ) {
      throw new ConflictError(
        "ROOM_UNAVAILABLE",
        "The room is no longer free for these dates",
      );
    }
    if (t === "checkIn") {
      if (room.status !== "available")
        throw new InvalidStateError(
          "ROOM_NOT_READY",
          `Room ${room.roomNumber} is ${room.status}`,
        );
      tx.update(rooms)
        .set({ status: "occupied" })
        .where(eq(rooms.id, room.id))
        .run();
    }
    if (t === "checkOut")
      tx.update(rooms)
        .set({ status: "dirty" })
        .where(eq(rooms.id, room.id))
        .run();

    tx.update(bookings)
      .set({
        status: rule.to,
        ...(t === "confirm" ? { holdExpiresAt: null } : {}),
      })
      .where(eq(bookings.id, booking.id))
      .run();
    audit.log(tx, {
      actor,
      action: `booking.${t}`,
      entity: "booking",
      entityId: booking.id,
      before: { status: booking.status },
      after: { status: rule.to, ...(reason ? { reason } : {}) },
    });
  };

  /** A verified deposit confirms a pending booking, unless the room was lost in the meantime. */
  const tryAutoConfirm = (tx: Tx, row: Scoped, actor: Actor): boolean => {
    const { booking, room } = row;
    if (booking.status !== "pending") return false;
    const bal = billing.balance(tx, booking.id);
    if (bal.netPaidCents <= 0 || !bal.depositMet) return false;
    const now = clock.now();
    if (
      !availability.isRoomFree(tx, {
        roomId: room.id,
        checkIn: booking.checkInDate,
        checkOut: booking.checkOutDate,
        now,
        excludeBookingId: booking.id,
      })
    ) {
      return false; // payment is still recorded; staff decide what to do
    }
    applyTransition(tx, "confirm", row, actor, now);
    return true;
  };

  // ---------- creating ----------
  const assertCapacity = (
    rt: RoomTypeRow,
    adults: number,
    children: number,
  ) => {
    if (adults + children > rt.maxOccupancy) {
      throw new ValidationError(
        `${rt.name} sleeps at most ${rt.maxOccupancy}`,
        undefined,
        "OVER_CAPACITY",
      );
    }
  };

  type NewBooking = {
    room: Pick<RoomRow, "id">;
    roomType: RoomTypeRow;
    stay: ResolvedStay;
    guestId: number;
    adults: number;
    children: number;
    status: "pending" | "confirmed";
    source: BookingSource;
    holdExpiresAt: Date | null;
    deposit: (totalCents: number) => number;
    specialRequests?: string;
    createdBy: string | null;
  };
  const insertBooking = (tx: Tx, v: NewBooking): BookingRow => {
    const total = priceStay(v.roomType, v.stay);
    const deposit = v.deposit(total);
    if (deposit > total)
      throw new ValidationError(
        "Deposit cannot exceed the room total",
        undefined,
        "DEPOSIT_TOO_HIGH",
      );
    return tx
      .insert(bookings)
      .values({
        guestId: v.guestId,
        roomId: v.room.id,
        bookingReferenceCode: newReference(),
        status: v.status,
        rateType: v.stay.rateType,
        adults: v.adults,
        children: v.children,
        totalCostCents: total,
        depositRequiredCents: deposit,
        specialRequests: v.specialRequests,
        checkInDate: v.stay.checkIn,
        checkOutDate: v.stay.checkOut,
        source: v.source,
        createdBy: v.createdBy,
        holdExpiresAt: v.holdExpiresAt,
      })
      .returning()
      .get();
  };

  return {
    // ================= staff =================
    createFromDesk(propertyId: number, input: DeskBookingInput, actor: Actor) {
      return db.transaction((tx) => {
        const now = clock.now();
        const property = tx
          .select()
          .from(properties)
          .where(eq(properties.id, propertyId))
          .get();
        if (!property) throw new NotFoundError("Property");
        const found = tx
          .select({ room: rooms, roomType: roomTypes })
          .from(rooms)
          .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
          .where(
            and(eq(rooms.id, input.roomId), eq(rooms.propertyId, propertyId)),
          )
          .get();
        if (!found) throw new NotFoundError("Room");
        const { room, roomType } = found;
        if (
          !room.isActive ||
          !roomType.isActive ||
          UNBOOKABLE.includes(room.status)
        ) {
          throw new ConflictError(
            "ROOM_UNAVAILABLE",
            `Room ${room.roomNumber} cannot be booked right now`,
          );
        }
        assertCapacity(roomType, input.adults, input.children);
        const stay = resolveStay(input.stay, property);
        if (
          !availability.isRoomFree(tx, {
            roomId: room.id,
            checkIn: stay.checkIn,
            checkOut: stay.checkOut,
            now,
          })
        ) {
          throw new ConflictError(
            "ROOM_UNAVAILABLE",
            `Room ${room.roomNumber} is already booked for those dates`,
          );
        }
        const guestId =
          input.guestId !== undefined
            ? guest.requireId(tx, input.guestId)
            : guest.findOrCreate(tx, input.guest!).id; // the struct guarantees one of the two

        const booking = insertBooking(tx, {
          room,
          roomType,
          stay,
          guestId,
          adults: input.adults,
          children: input.children,
          status: "confirmed",
          source: input.source,
          holdExpiresAt: null,
          // The property's deposit percentage is the default. Staff may
          // override it for a particular booking.
          deposit: (total) =>
            input.depositRequiredCents ??
            Math.ceil((total * property.depositPercent) / 100),
          specialRequests: input.specialRequests,
          createdBy: actor.userId,
        });
        if (input.initialPayment) {
          billing.record(tx, {
            ...input.initialPayment,
            bookingId: booking.id,
            status: "succeeded",
            recordedBy: actor.userId,
          });
        }
        audit.log(tx, {
          actor,
          action: "booking.create",
          entity: "booking",
          entityId: booking.id,
          after: {
            status: booking.status,
            roomId: room.id,
            totalCostCents: booking.totalCostCents,
            source: booking.source,
          },
        });
        return getDetail(tx, propertyId, booking.id);
      }, IMMEDIATE);
    },

    get: (propertyId: number, bookingId: number) =>
      getDetail(db, propertyId, bookingId),

    list(propertyId: number, q: BookingListInput) {
      const term = q.q?.replace(/[%_\\]/g, "").trim();
      /**
       * The desk searches by reference, by name or by phone. Each of those
       * is matched only when the term could be it, so that a reference like
       * "BK-7Q2M1" does not also match every guest whose phone number
       * happens to contain a 7, a 2 or a 1.
       */
      const looksLikePhone = term ? /^\+?\d[\d\s-]{5,}$/.test(term) : false;
      const looksLikeName = term ? !/\d/.test(term) : false;
      // The leading zero is dropped, so 0712… and 712… find the same guest.
      const digits = looksLikePhone
        ? term!.replace(/\D/g, "").replace(/^0/, "")
        : "";
      const where = and(
        eq(rooms.propertyId, propertyId),
        q.status ? eq(bookings.status, q.status) : undefined,
        q.roomId ? eq(bookings.roomId, q.roomId) : undefined,
        q.from ? gt(bookings.checkOutDate, q.from) : undefined,
        q.to ? lt(bookings.checkInDate, q.to) : undefined,
        term
          ? or(
              eq(bookings.bookingReferenceCode, normalizeCode(term)),
              looksLikeName ? like(guests.firstName, `%${term}%`) : undefined,
              looksLikeName ? like(guests.lastName, `%${term}%`) : undefined,
              digits ? like(guests.phone, `%${digits}%`) : undefined,
            )
          : undefined,
      );
      const total = db
        .select({ n: count() })
        .from(bookings)
        .innerJoin(rooms, eq(rooms.id, bookings.roomId))
        .innerJoin(guests, eq(guests.id, bookings.guestId))
        .where(where)
        .get()!.n;
      const rows = db
        .select({
          id: bookings.id,
          reference: bookings.bookingReferenceCode,
          status: bookings.status,
          rateType: bookings.rateType,
          checkInDate: bookings.checkInDate,
          checkOutDate: bookings.checkOutDate,
          totalCostCents: bookings.totalCostCents,
          depositRequiredCents: bookings.depositRequiredCents,
          source: bookings.source,
          roomId: rooms.id,
          roomNumber: rooms.roomNumber,
          roomType: roomTypes.name,
          guestId: guests.id,
          guestName: sql<string>`${guests.firstName} || ' ' || ${guests.lastName}`,
          guestPhone: guests.phone,
        })
        .from(bookings)
        .innerJoin(rooms, eq(rooms.id, bookings.roomId))
        .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
        .innerJoin(guests, eq(guests.id, bookings.guestId))
        .where(where)
        .orderBy(desc(bookings.checkInDate))
        .limit(q.limit)
        .offset(q.offset)
        .all();
      return paged(rows, total, q);
    },

    /**
     * Edit the parts of a booking that may change after it is made:
     * party size, special requests and the deposit requirement.
     * The stay itself and the room are immutable; cancel and rebook instead.
     */
    update(
      propertyId: number,
      bookingId: number,
      patch: {
        adults?: number;
        children?: number;
        specialRequests?: string;
        depositRequiredCents?: number;
      },
      actor: Actor,
    ) {
      return db.transaction((tx) => {
        const { booking, room } = loadScoped(tx, propertyId, bookingId);
        if (
          booking.status === "checked_out" ||
          booking.status === "cancelled"
        ) {
          throw new InvalidStateError(
            "BOOKING_CLOSED",
            "A closed booking cannot be edited",
          );
        }
        const before = {
          adults: booking.adults,
          children: booking.children,
          specialRequests: booking.specialRequests,
          depositRequiredCents: booking.depositRequiredCents,
        };
        const next = { ...before, ...patch };
        if (next.adults + next.children < 1) {
          throw new ValidationError(
            "A booking needs at least one person",
            undefined,
            "INVALID_PARTY",
          );
        }
        if (next.depositRequiredCents > booking.totalCostCents) {
          throw new ValidationError(
            "The deposit cannot exceed the total",
            undefined,
            "INVALID_DEPOSIT",
          );
        }
        // Capacity is checked against the room type, so a party cannot grow
        // past what the room can hold.
        const roomType = tx
          .select()
          .from(roomTypes)
          .where(eq(roomTypes.id, room.roomTypeId))
          .get();
        if (roomType) {
          assertCapacity(roomType, next.adults, next.children);
        }
        tx.update(bookings)
          .set({
            adults: next.adults,
            children: next.children,
            specialRequests: next.specialRequests,
            depositRequiredCents: next.depositRequiredCents,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, bookingId))
          .run();
        audit.log(tx, {
          actor,
          action: "booking.updated",
          entity: "booking",
          entityId: bookingId,
          before,
          after: next,
        });
        return getDetail(tx, propertyId, bookingId);
      });
    },

    /** Attach another guest to the party. */
    addGuest(
      propertyId: number,
      bookingId: number,
      guestId: number,
      actor: Actor,
    ) {
      return db.transaction((tx) => {
        const { booking } = loadScoped(tx, propertyId, bookingId);
        if (
          booking.status === "checked_out" ||
          booking.status === "cancelled"
        ) {
          throw new InvalidStateError(
            "BOOKING_CLOSED",
            "A closed booking cannot be changed",
          );
        }
        const guest = tx
          .select()
          .from(guests)
          .where(eq(guests.id, guestId))
          .get();
        if (!guest) throw new NotFoundError("Guest");
        if (guest.id === booking.guestId) {
          throw new ConflictError(
            "ALREADY_PRIMARY_GUEST",
            "That guest is already the lead guest on this booking",
          );
        }
        const exists = tx
          .select()
          .from(additionalGuests)
          .where(
            and(
              eq(additionalGuests.bookingId, bookingId),
              eq(additionalGuests.guestId, guestId),
            ),
          )
          .get();
        if (exists) {
          throw new ConflictError(
            "ALREADY_ADDED",
            "That guest is already on this booking",
          );
        }
        tx.insert(additionalGuests).values({ bookingId, guestId }).run();
        audit.log(tx, {
          actor,
          action: "booking.guest_added",
          entity: "booking",
          entityId: bookingId,
          after: { guestId },
        });
        return getDetail(tx, propertyId, bookingId);
      });
    },

    /** Detach an additional guest from the party. */
    removeGuest(
      propertyId: number,
      bookingId: number,
      guestId: number,
      actor: Actor,
    ) {
      return db.transaction((tx) => {
        loadScoped(tx, propertyId, bookingId);
        const row = tx
          .select()
          .from(additionalGuests)
          .where(
            and(
              eq(additionalGuests.bookingId, bookingId),
              eq(additionalGuests.guestId, guestId),
            ),
          )
          .get();
        if (!row) throw new NotFoundError("Additional guest");
        tx.delete(additionalGuests)
          .where(eq(additionalGuests.id, row.id))
          .run();
        audit.log(tx, {
          actor,
          action: "booking.guest_removed",
          entity: "booking",
          entityId: bookingId,
          before: { guestId },
        });
        return getDetail(tx, propertyId, bookingId);
      });
    },

    /** Add a billable service line to a booking. */
    addService(
      propertyId: number,
      bookingId: number,
      input: { serviceId: number; quantity?: number; notes?: string },
      actor: Actor,
    ) {
      return db.transaction((tx) => {
        const { booking, room } = loadScoped(tx, propertyId, bookingId);
        if (
          booking.status === "checked_out" ||
          booking.status === "cancelled"
        ) {
          throw new InvalidStateError(
            "BOOKING_CLOSED",
            "A closed booking cannot be changed",
          );
        }
        const service = tx
          .select()
          .from(services)
          .where(
            and(
              eq(services.id, input.serviceId),
              eq(services.propertyId, propertyId),
            ),
          )
          .get();
        if (!service) throw new NotFoundError("Service");
        const quantity = input.quantity ?? 1;
        const subtotal = service.priceCents * quantity;
        tx.insert(serviceBookings)
          .values({
            bookingId,
            serviceId: service.id,
            quantity,
            unitPriceCents: service.priceCents,
            subtotalCents: subtotal,
            notes: input.notes ?? null,
          })
          .run();
        audit.log(tx, {
          actor,
          action: "booking.service_added",
          entity: "booking",
          entityId: bookingId,
          after: { serviceId: service.id, quantity, subtotal },
        });
        return getDetail(tx, propertyId, bookingId);
      });
    },

    /** Remove a service line from a booking. */
    removeService(
      propertyId: number,
      bookingId: number,
      lineId: number,
      actor: Actor,
    ) {
      return db.transaction((tx) => {
        loadScoped(tx, propertyId, bookingId);
        const row = tx
          .select()
          .from(serviceBookings)
          .where(
            and(
              eq(serviceBookings.id, lineId),
              eq(serviceBookings.bookingId, bookingId),
            ),
          )
          .get();
        if (!row) throw new NotFoundError("Service line");
        tx.delete(serviceBookings).where(eq(serviceBookings.id, lineId)).run();
        audit.log(tx, {
          actor,
          action: "booking.service_removed",
          entity: "booking",
          entityId: bookingId,
          before: { lineId, subtotalCents: row.subtotalCents },
        });
        return getDetail(tx, propertyId, bookingId);
      });
    },

    /** confirm | checkIn | checkOut | noShow | cancel */
    transition(
      propertyId: number,
      bookingId: number,
      t: Transition,
      actor: Actor,
      reason?: string,
    ) {
      return db.transaction((tx) => {
        applyTransition(
          tx,
          t,
          loadScoped(tx, propertyId, bookingId),
          actor,
          clock.now(),
          reason,
        );
        return getDetail(tx, propertyId, bookingId);
      }, IMMEDIATE);
    },

    recordPayment(
      propertyId: number,
      bookingId: number,
      input: RecordPaymentInput,
      actor: Actor,
    ) {
      return db.transaction((tx) => {
        const row = loadScoped(tx, propertyId, bookingId);
        const payment = billing.record(tx, {
          ...input,
          bookingId,
          status: "succeeded",
          recordedBy: actor.userId,
        });
        audit.log(tx, {
          actor,
          action: "payment.record",
          entity: "payment",
          entityId: payment.id,
          after: {
            bookingId,
            type: payment.type,
            amountCents: payment.amountCents,
          },
        });
        const autoConfirmed = tryAutoConfirm(tx, row, actor);
        return {
          payment,
          autoConfirmed,
          booking: getDetail(tx, propertyId, bookingId),
        };
      }, IMMEDIATE);
    },

    /** Staff verify a guest-submitted proof against the M-Pesa statement. */
    reviewPayment(
      propertyId: number,
      paymentId: number,
      input: ReviewPaymentInput,
      actor: Actor,
    ) {
      return db.transaction((tx) => {
        const before = billing.findScoped(tx, propertyId, paymentId);
        const payment = billing.review(tx, paymentId, input);
        audit.log(tx, {
          actor,
          action: `payment.${input.decision}`,
          entity: "payment",
          entityId: paymentId,
          before: { status: before.status, amountCents: before.amountCents },
          after: { status: payment.status, amountCents: payment.amountCents },
        });
        const row = loadScoped(tx, propertyId, before.bookingId);
        const autoConfirmed =
          input.decision === "succeeded" && tryAutoConfirm(tx, row, actor);
        return {
          payment,
          autoConfirmed,
          booking: getDetail(tx, propertyId, before.bookingId),
        };
      }, IMMEDIATE);
    },

    // ================= guests (public or signed in) =================
    createOnline(slug: string, input: OnlineBookingInput, actor: Actor) {
      const { booking, property, roomType } = db.transaction((tx) => {
        const now = clock.now();
        const property = tx
          .select()
          .from(properties)
          .where(and(eq(properties.slug, slug), eq(properties.isActive, true)))
          .get();
        if (!property) throw new NotFoundError("Property");
        const roomType = tx
          .select()
          .from(roomTypes)
          .where(
            and(
              eq(roomTypes.id, input.roomTypeId),
              eq(roomTypes.propertyId, property.id),
              eq(roomTypes.isActive, true),
            ),
          )
          .get();
        if (!roomType) throw new NotFoundError("Room type");
        assertCapacity(roomType, input.adults, input.children);
        const stay = resolveStay(input.stay, property);
        assertNotPast(stay, now);
        priceStay(roomType, stay); // fail early if hourly isn't offered

        const room = availability.findFreeRoom(tx, {
          propertyId: property.id,
          roomTypeId: roomType.id,
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
          now,
        });
        if (!room)
          throw new ConflictError(
            "ROOM_UNAVAILABLE",
            "No rooms of this type are available for those dates",
          );

        const guestId = guest.forOnlineBooking(tx, actor.userId, input.guest);
        const booking = insertBooking(tx, {
          room,
          roomType,
          stay,
          guestId,
          adults: input.adults,
          children: input.children,
          status: "pending",
          source: "website",
          holdExpiresAt: new Date(now.getTime() + config.holdMinutes * 60_000),
          deposit: (total) =>
            Math.ceil((total * property.depositPercent) / 100),
          specialRequests: input.specialRequests,
          createdBy: null, // createdBy is for staff
        });
        audit.log(tx, {
          actor,
          action: "booking.create_online",
          entity: "booking",
          entityId: booking.id,
          after: { roomId: room.id, totalCostCents: booking.totalCostCents },
        });
        return { booking, property, roomType };
      }, IMMEDIATE);

      return {
        reference: booking.bookingReferenceCode,
        status: booking.status,
        property: property.name,
        roomType: roomType.name,
        rateType: booking.rateType,
        checkIn: booking.checkInDate,
        checkOut: booking.checkOutDate,
        currency: "KES",
        totalCostCents: booking.totalCostCents,
        depositRequiredCents: booking.depositRequiredCents,
        holdExpiresAt: booking.holdExpiresAt,
        paymentOptions: billing.listPaymentOptions(property.id, true), // owner-editable, never hard-coded
      };
    },

    viewAsGuest: (access: GuestAccess) =>
      guestView(db, loadForGuest(db, access)),

    cancelAsGuest(
      access: GuestAccess,
      reason: string | undefined,
      actor: Actor,
    ) {
      return db.transaction((tx) => {
        applyTransition(
          tx,
          "cancel",
          loadForGuest(tx, access),
          actor,
          clock.now(),
          reason,
        );
        return guestView(tx, loadForGuest(tx, access));
      }, IMMEDIATE);
    },

    /** Guest pastes their M-Pesa code / SMS. Creates a *pending* payment for staff to verify. */
    submitProof(access: GuestAccess, input: ProofInput, actor: Actor) {
      return db.transaction((tx) => {
        const now = clock.now();
        const row = loadForGuest(tx, access);
        const { booking, room } = row;
        if (booking.status !== "pending" && booking.status !== "confirmed") {
          throw new InvalidStateError(
            "BOOKING_CLOSED",
            "Payments can no longer be submitted for this booking",
          );
        }
        const submitted = tx
          .select({ n: count() })
          .from(payments)
          .where(
            and(
              eq(payments.bookingId, booking.id),
              isNull(payments.recordedBy),
            ),
          )
          .get()!.n;
        if (submitted >= MAX_PROOFS)
          throw new ConflictError(
            "TOO_MANY_PROOFS",
            "Please contact the property to confirm your payment",
          );

        // Extending an expired hold must not double-allocate a room someone else has since booked.
        if (booking.status === "pending" && booking.holdExpiresAt) {
          if (
            booking.holdExpiresAt <= now &&
            !availability.isRoomFree(tx, {
              roomId: room.id,
              checkIn: booking.checkInDate,
              checkOut: booking.checkOutDate,
              now,
              excludeBookingId: booking.id,
            })
          ) {
            throw new ConflictError(
              "HOLD_EXPIRED",
              "This reservation expired and the room has been taken. Please make a new booking.",
            );
          }
          const until = Math.max(
            booking.holdExpiresAt.getTime(),
            now.getTime() + config.proofHoldHours * HOUR,
          );
          tx.update(bookings)
            .set({ holdExpiresAt: new Date(until) })
            .where(eq(bookings.id, booking.id))
            .run();
        }

        const payment = billing.record(tx, {
          bookingId: booking.id,
          type: booking.status === "pending" ? "deposit" : "payment",
          status: "pending",
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod,
          transactionReferenceCode: input.transactionReferenceCode,
          proofMessage: input.proofMessage,
          recordedBy: null,
        });
        audit.log(tx, {
          actor,
          action: "payment.proof_submitted",
          entity: "payment",
          entityId: payment.id,
          after: { bookingId: booking.id, amountCents: payment.amountCents },
        });
        return guestView(tx, loadForGuest(tx, access));
      }, IMMEDIATE);
    },

    listForUser(userId: string, q: MyBookingsInput) {
      const now = clock.now();
      const where = and(
        eq(guests.userId, userId),
        q.when === "upcoming" ? gt(bookings.checkOutDate, now) : undefined,
        q.when === "past" ? lte(bookings.checkOutDate, now) : undefined,
      );
      const total = db
        .select({ n: count() })
        .from(bookings)
        .innerJoin(guests, eq(guests.id, bookings.guestId))
        .where(where)
        .get()!.n;
      const rows = db
        .select({
          reference: bookings.bookingReferenceCode,
          status: bookings.status,
          rateType: bookings.rateType,
          checkIn: bookings.checkInDate,
          checkOut: bookings.checkOutDate,
          totalCostCents: bookings.totalCostCents,
          property: properties.name,
          propertySlug: properties.slug,
          roomType: roomTypes.name,
        })
        .from(bookings)
        .innerJoin(guests, eq(guests.id, bookings.guestId))
        .innerJoin(rooms, eq(rooms.id, bookings.roomId))
        .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
        .innerJoin(properties, eq(properties.id, rooms.propertyId))
        .where(where)
        .orderBy(desc(bookings.checkInDate))
        .limit(q.limit)
        .offset(q.offset)
        .all();
      return paged(rows, total, q);
    },

    // ================= housekeeping =================
    /** Tidies status only. Correctness never depends on this running: the availability query ignores expired holds. */
    expireHolds(): number {
      return db.transaction((tx) => {
        const expired = tx
          .update(bookings)
          .set({ status: "cancelled" })
          .where(
            and(
              eq(bookings.status, "pending"),
              isNotNull(bookings.holdExpiresAt),
              lt(bookings.holdExpiresAt, clock.now()),
            ),
          )
          .returning({ id: bookings.id })
          .all();
        for (const b of expired)
          audit.log(tx, {
            actor: SYSTEM,
            action: "booking.hold_expired",
            entity: "booking",
            entityId: b.id,
          });
        return expired.length;
      }, IMMEDIATE);
    },
  };
};
export type BookingService = ReturnType<typeof createBookingService>;
