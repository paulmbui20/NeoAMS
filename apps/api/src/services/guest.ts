// src/services/guest.ts
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { NotFoundError, ValidationError } from "../core/errors";
import { normalizeCode, normalizePhone } from "../core/normalize";
import { paged, type Page } from "../core/pagination";
import type { Conn, Db } from "../db";
import { bookings, guests } from "../db/schema";
import type {
  DeskGuestInput,
  GuestProfileInput,
  PublicGuestInput,
} from "@neoams/shared";

const profileColumns = {
  id: guests.id,
  firstName: guests.firstName,
  middleName: guests.middleName,
  lastName: guests.lastName,
  email: guests.email,
  phone: guests.phone,
  country: guests.country,
  nationality: guests.nationality,
  dateOfBirth: guests.dateOfBirth,
  gender: guests.gender,
  address: guests.address,
}; // deliberately excludes staff `notes` and ID document

const profileValues = (g: GuestProfileInput) => ({
  firstName: g.firstName,
  middleName: g.middleName ?? null,
  lastName: g.lastName,
  phone: normalizePhone(g.phone),
  email: g.email?.toLowerCase() ?? null,
  country: g.country ?? null,
  nationality: g.nationality ?? null,
  dateOfBirth: g.dateOfBirth ?? null,
  gender: g.gender ?? null,
  address: g.address ?? null,
});

const insert = (c: Conn, g: DeskGuestInput, userId: string | null) =>
  c
    .insert(guests)
    .values({
      ...profileValues(g),
      userId,
      idType: g.idType ?? null,
      idNumber: g.idNumber ? normalizeCode(g.idNumber) : null,
      notes: g.notes ?? null,
    })
    .returning({ id: guests.id })
    .get().id;

export const createGuestService = ({ db }: { db: Db }) => {
  /**
   * tx-first. Reuse a guest only on a certain match: same ID document, or same phone AND same name.
   * Never updates the match, so public input can't overwrite a real guest's record.
   */
  const findOrCreate = (
    c: Conn,
    input: DeskGuestInput,
  ): { id: number; created: boolean } => {
    const v = profileValues(input);
    const idNumber = input.idNumber ? normalizeCode(input.idNumber) : null;
    const byId =
      input.idType && idNumber
        ? c
            .select({ id: guests.id })
            .from(guests)
            .where(
              and(
                eq(guests.idType, input.idType),
                eq(guests.idNumber, idNumber),
              ),
            )
            .get()
        : undefined;
    const existing =
      byId ??
      c
        .select({ id: guests.id })
        .from(guests)
        .where(
          and(
            eq(guests.phone, v.phone),
            sql`lower(${guests.firstName}) = ${v.firstName.toLowerCase()}`,
            sql`lower(${guests.lastName}) = ${v.lastName.toLowerCase()}`,
          ),
        )
        .get();
    return existing
      ? { id: existing.id, created: false }
      : { id: insert(c, input, null), created: true };
  };

  return {
    findOrCreate,

    /** db-level wrapper: opens an immediate transaction so the route never touches db. */
    findOrCreateOne: (input: DeskGuestInput) =>
      db.transaction((tx) => findOrCreate(tx, input), {
        behavior: "immediate",
      }),

    /** tx-first */
    requireId(c: Conn, id: number): number {
      if (
        !c.select({ id: guests.id }).from(guests).where(eq(guests.id, id)).get()
      )
        throw new NotFoundError("Guest");
      return id;
    },

    /**
     * tx-first. Online bookings:
     *  - signed in: use their profile, or create it (linked, never merged into someone else's record)
     *  - anonymous: find-or-create by phone + name
     */
    forOnlineBooking(
      c: Conn,
      userId: string | null,
      input?: PublicGuestInput,
    ): number {
      if (userId) {
        const mine = c
          .select({ id: guests.id })
          .from(guests)
          .where(eq(guests.userId, userId))
          .get();
        if (mine) return mine.id;
      }
      if (!input)
        throw new ValidationError(
          "Guest details are required",
          undefined,
          "GUEST_REQUIRED",
        );
      return userId ? insert(c, input, userId) : findOrCreate(c, input).id;
    },

    // ---- self-service ----
    profileFor: (userId: string) =>
      db
        .select(profileColumns)
        .from(guests)
        .where(eq(guests.userId, userId))
        .get() ?? null,

    upsertForUser(userId: string, input: GuestProfileInput) {
      return db.transaction(
        (tx) => {
          const mine = tx
            .select({ id: guests.id })
            .from(guests)
            .where(eq(guests.userId, userId))
            .get();
          if (mine)
            tx.update(guests)
              .set(profileValues(input))
              .where(eq(guests.id, mine.id))
              .run();
          else insert(tx, input, userId);
          return tx
            .select(profileColumns)
            .from(guests)
            .where(eq(guests.userId, userId))
            .get()!;
        },
        { behavior: "immediate" },
      );
    },

    // ---- desk ----
    search(q: string, page: Page) {
      const term = q.replace(/[%_\\]/g, "");
      let phone: string | undefined;
      try {
        phone = normalizePhone(q);
      } catch {
        /* not a phone number */
      }
      const where = or(
        like(guests.firstName, `%${term}%`),
        like(guests.lastName, `%${term}%`),
        like(guests.email, `%${term}%`),
        eq(guests.idNumber, normalizeCode(q)),
        phone ? eq(guests.phone, phone) : undefined,
      );
      const total = db.select({ n: count() }).from(guests).where(where).get()!
        .n;
      const rows = db
        .select(profileColumns)
        .from(guests)
        .where(where)
        .orderBy(desc(guests.id))
        .limit(page.limit)
        .offset(page.offset)
        .all();
      return paged(rows, total, page);
    },

    get(id: number) {
      const guest = db.select().from(guests).where(eq(guests.id, id)).get();
      if (!guest) throw new NotFoundError("Guest");
      const history = db
        .select({
          id: bookings.id,
          reference: bookings.bookingReferenceCode,
          status: bookings.status,
          checkInDate: bookings.checkInDate,
          checkOutDate: bookings.checkOutDate,
        })
        .from(bookings)
        .where(eq(bookings.guestId, id))
        .orderBy(desc(bookings.checkInDate))
        .limit(20)
        .all();
      return { ...guest, bookings: history };
    },

    update(id: number, patch: Partial<DeskGuestInput>) {
      const existing = db.select().from(guests).where(eq(guests.id, id)).get();
      if (!existing) throw new NotFoundError("Guest");
      const values: Record<string, unknown> = {};
      if (patch.firstName !== undefined) values.firstName = patch.firstName;
      if (patch.middleName !== undefined)
        values.middleName = patch.middleName || null;
      if (patch.lastName !== undefined) values.lastName = patch.lastName;
      if (patch.phone !== undefined) values.phone = normalizePhone(patch.phone);
      if (patch.email !== undefined)
        values.email = patch.email ? patch.email.toLowerCase() : null;
      if (patch.country !== undefined) values.country = patch.country || null;
      if (patch.nationality !== undefined)
        values.nationality = patch.nationality || null;
      if (patch.dateOfBirth !== undefined)
        values.dateOfBirth = patch.dateOfBirth || null;
      if (patch.gender !== undefined) values.gender = patch.gender || null;
      if (patch.address !== undefined) values.address = patch.address || null;
      if (patch.idType !== undefined) values.idType = patch.idType || null;
      if (patch.idNumber !== undefined)
        values.idNumber = patch.idNumber ? normalizeCode(patch.idNumber) : null;
      if (patch.notes !== undefined) values.notes = patch.notes || null;
      if (Object.keys(values).length > 0) {
        db.update(guests).set(values).where(eq(guests.id, id)).run();
      }
      return this.get(id);
    },
  };
};
export type GuestService = ReturnType<typeof createGuestService>;
