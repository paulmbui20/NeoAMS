// src/services/overview.ts
// The "today" screen: arrivals, departures, in-house, housekeeping and proofs.
import { and, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { bookings, payments, rooms } from "../db/schema";

export const createOverviewService = ({ db }: { db: Db }) => {
  /**
   * A day window in UTC milliseconds. The property timezone is Africa/Nairobi
   * (+03:00, no DST), so the day boundaries are fixed offsets.
   */
  const dayWindow = (date: Date) => {
    const start = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
        3 * 3600_000,
    );
    const end = new Date(start.getTime() + 24 * 3600_000);
    return { start, end };
  };

  const today = (propertyId: number, now: Date) => {
    const { start, end } = dayWindow(now);

    const arrivals = db
      .select({
        id: bookings.id,
        reference: bookings.bookingReferenceCode,
        status: bookings.status,
        checkInDate: bookings.checkInDate,
        checkOutDate: bookings.checkOutDate,
        adults: bookings.adults,
        children: bookings.children,
        roomId: bookings.roomId,
        roomNumber: rooms.roomNumber,
      })
      .from(bookings)
      .innerJoin(rooms, eq(rooms.id, bookings.roomId))
      .where(
        and(
          eq(rooms.propertyId, propertyId),
          gte(bookings.checkInDate, start),
          lt(bookings.checkInDate, end),
          inArray(bookings.status, ["pending", "confirmed"]),
        ),
      )
      .orderBy(bookings.checkInDate)
      .all();

    const departures = db
      .select({
        id: bookings.id,
        reference: bookings.bookingReferenceCode,
        status: bookings.status,
        checkInDate: bookings.checkInDate,
        checkOutDate: bookings.checkOutDate,
        roomId: bookings.roomId,
        roomNumber: rooms.roomNumber,
      })
      .from(bookings)
      .innerJoin(rooms, eq(rooms.id, bookings.roomId))
      .where(
        and(
          eq(rooms.propertyId, propertyId),
          gte(bookings.checkOutDate, start),
          lt(bookings.checkOutDate, end),
          inArray(bookings.status, ["confirmed", "checked_in"]),
        ),
      )
      .orderBy(bookings.checkOutDate)
      .all();

    const inHouse = db
      .select({
        id: bookings.id,
        reference: bookings.bookingReferenceCode,
        status: bookings.status,
        checkOutDate: bookings.checkOutDate,
        roomId: bookings.roomId,
        roomNumber: rooms.roomNumber,
      })
      .from(bookings)
      .innerJoin(rooms, eq(rooms.id, bookings.roomId))
      .where(
        and(
          eq(rooms.propertyId, propertyId),
          eq(bookings.status, "checked_in"),
        ),
      )
      .all();

    const dirtyRooms = db
      .select({
        id: rooms.id,
        roomNumber: rooms.roomNumber,
        floor: rooms.floor,
        status: rooms.status,
      })
      .from(rooms)
      .where(
        and(
          eq(rooms.propertyId, propertyId),
          inArray(rooms.status, ["dirty", "maintenance", "out_of_order"]),
        ),
      )
      .orderBy(rooms.roomNumber)
      .all();

    const pendingProofs =
      db
        .select({ c: sql<number>`count(*)` })
        .from(payments)
        .innerJoin(bookings, eq(bookings.id, payments.bookingId))
        .innerJoin(rooms, eq(rooms.id, bookings.roomId))
        .where(
          and(eq(rooms.propertyId, propertyId), eq(payments.status, "pending")),
        )
        .get()?.c ?? 0;

    const totalRooms =
      db
        .select({ c: sql<number>`count(*)` })
        .from(rooms)
        .where(and(eq(rooms.propertyId, propertyId), eq(rooms.isActive, true)))
        .get()?.c ?? 0;

    const occupiedTonight =
      db
        .select({ c: sql<number>`count(*)` })
        .from(bookings)
        .innerJoin(rooms, eq(rooms.id, bookings.roomId))
        .where(
          and(
            eq(rooms.propertyId, propertyId),
            inArray(bookings.status, ["confirmed", "checked_in"]),
            lte(bookings.checkInDate, end),
            gte(bookings.checkOutDate, start),
          ),
        )
        .get()?.c ?? 0;

    return {
      date: now.toISOString().slice(0, 10),
      arrivals,
      departures,
      inHouse,
      dirtyRooms,
      counts: {
        arrivals: arrivals.length,
        departures: departures.length,
        inHouse: inHouse.length,
        dirtyRooms: dirtyRooms.length,
        pendingProofs,
        totalRooms,
        occupancy: totalRooms === 0 ? 0 : occupiedTonight / totalRooms,
      },
    };
  };

  return { today };
};

export type OverviewService = ReturnType<typeof createOverviewService>;
