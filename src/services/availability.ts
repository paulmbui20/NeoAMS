// src/services/availability.ts  (single source of truth for "is this bookable")
import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { Clock } from "../core/clock";
import { NotFoundError } from "../core/errors";
import {
  assertNotPast,
  resolveStay,
  unitRate,
  type StayInput,
} from "../core/stay";
import type { Conn, Db } from "../db";
import type { RoomStatus } from "../db/enums";
import { bookings, properties, roomTypes, rooms } from "../db/schema";

/** Physical states that block *new* bookings. dirty/occupied are transient and don't. */
export const UNBOOKABLE: RoomStatus[] = ["maintenance", "out_of_order"];

/** A booking occupies its room if confirmed/checked-in, or pending with a live (or no) hold. */
const blocking = (now: Date) =>
  or(
    inArray(bookings.status, ["confirmed", "checked_in"]),
    and(
      eq(bookings.status, "pending"),
      or(isNull(bookings.holdExpiresAt), gt(bookings.holdExpiresAt, now)),
    ),
  );
const overlaps = (checkIn: Date, checkOut: Date) =>
  and(lt(bookings.checkInDate, checkOut), gt(bookings.checkOutDate, checkIn)); // back-to-back stays don't clash

type Window = {
  checkIn: Date;
  checkOut: Date;
  now: Date;
  excludeBookingId?: number;
};
type FreeQuery = Window & { propertyId: number; roomTypeId?: number };

const freeRooms = (c: Conn, q: FreeQuery) => {
  const clash = c
    .select({ one: sql`1` })
    .from(bookings)
    .where(
      and(
        eq(bookings.roomId, rooms.id),
        blocking(q.now),
        overlaps(q.checkIn, q.checkOut),
        q.excludeBookingId ? ne(bookings.id, q.excludeBookingId) : undefined,
      ),
    );
  return c
    .select({
      id: rooms.id,
      roomNumber: rooms.roomNumber,
      floor: rooms.floor,
      roomTypeId: rooms.roomTypeId,
      roomTypeName: roomTypes.name,
      pricePerNightCents: roomTypes.pricePerNightCents,
      pricePerHourCents: roomTypes.pricePerHourCents,
    })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(
      and(
        eq(rooms.propertyId, q.propertyId),
        eq(rooms.isActive, true),
        eq(roomTypes.isActive, true),
        notInArray(rooms.status, UNBOOKABLE),
        q.roomTypeId ? eq(rooms.roomTypeId, q.roomTypeId) : undefined,
        notExists(clash),
      ),
    )
    .orderBy(asc(rooms.roomNumber));
};

export const createAvailabilityService = ({
  db,
  clock,
}: {
  db: Db;
  clock: Clock;
}) => {
  const property = (where: ReturnType<typeof eq>) => {
    const p = db.select().from(properties).where(where).get();
    if (!p) throw new NotFoundError("Property");
    return p;
  };

  return {
    /** tx-first */
    isRoomFree(c: Conn, q: Window & { roomId: number }): boolean {
      return !c
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.roomId, q.roomId),
            blocking(q.now),
            overlaps(q.checkIn, q.checkOut),
            q.excludeBookingId
              ? ne(bookings.id, q.excludeBookingId)
              : undefined,
          ),
        )
        .limit(1)
        .get();
    },

    /** tx-first. First free room of a type: how online bookings pick a room. */
    findFreeRoom(c: Conn, q: FreeQuery) {
      return freeRooms(c, q).limit(1).get();
    },

    /** Public: room types with a free room, plus the quoted total. */
    searchBySlug(
      slug: string,
      q: StayInput & { adults: number; children: number },
    ) {
      const now = clock.now();
      const p = property(
        and(eq(properties.slug, slug), eq(properties.isActive, true))!,
      );
      const stay = resolveStay(q, p);
      assertNotPast(stay, now);

      const free = new Map<number, number>();
      for (const r of freeRooms(db, {
        propertyId: p.id,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        now,
      }).all()) {
        free.set(r.roomTypeId, (free.get(r.roomTypeId) ?? 0) + 1);
      }
      const types = db
        .select()
        .from(roomTypes)
        .where(
          and(
            eq(roomTypes.propertyId, p.id),
            eq(roomTypes.isActive, true),
            gte(roomTypes.maxOccupancy, q.adults + q.children),
          ),
        )
        .orderBy(asc(roomTypes.pricePerNightCents))
        .all();

      return types.flatMap((t) => {
        const unit = unitRate(t, stay.rateType);
        const availableCount = free.get(t.id) ?? 0;
        if (unit === null || availableCount === 0) return [];
        return [
          {
            roomTypeId: t.id,
            name: t.name,
            slug: t.slug,
            description: t.description,
            maxOccupancy: t.maxOccupancy,
            bedConfiguration: t.bedConfiguration,
            availableCount,
            rateType: stay.rateType,
            units: stay.units,
            unitPriceCents: unit,
            totalCents: unit * stay.units,
            currency: "KES",
          },
        ];
      });
    },

    /** Desk: actual free rooms to choose from. */
    listFreeRooms(propertyId: number, q: StayInput & { roomTypeId?: number }) {
      const p = property(eq(properties.id, propertyId));
      const stay = resolveStay(q, p);
      return freeRooms(db, {
        propertyId,
        roomTypeId: q.roomTypeId,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        now: clock.now(),
      })
        .all()
        .flatMap((r) => {
          const unit = unitRate(r, stay.rateType);
          return unit === null
            ? []
            : [
                {
                  id: r.id,
                  roomNumber: r.roomNumber,
                  floor: r.floor,
                  roomType: { id: r.roomTypeId, name: r.roomTypeName },
                  rateType: stay.rateType,
                  units: stay.units,
                  totalCents: unit * stay.units,
                  currency: "KES",
                },
              ];
        });
    },
  };
};
export type AvailabilityService = ReturnType<typeof createAvailabilityService>;
