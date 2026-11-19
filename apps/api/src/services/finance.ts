// src/services/finance.ts
// Expenses, expense categories and the reports the dashboard shows.
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { ConflictError, NotFoundError } from "../core/errors";
import type { Db } from "../db";
import {
  bookings,
  expenseCategories,
  expenses,
  payments,
  rooms,
} from "../db/schema";

export const createFinanceService = ({ db }: { db: Db }) => {
  /* ------------------------------------------------------ expense categories */

  const listCategories = () =>
    db.select().from(expenseCategories).orderBy(expenseCategories.name).all();

  const createCategory = (input: { name: string; description?: string }) => {
    const existing = db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.name, input.name))
      .get();
    if (existing) {
      throw new ConflictError(
        "CATEGORY_EXISTS",
        "That expense category already exists",
      );
    }
    return db.insert(expenseCategories).values(input).returning().get();
  };

  /* --------------------------------------------------------------- expenses */

  const listExpenses = (
    propertyId: number,
    filter: {
      from?: string;
      to?: string;
      categoryId?: number;
      limit: number;
      offset: number;
    },
  ) => {
    const filters = [eq(expenses.propertyId, propertyId)];
    if (filter.from) filters.push(gte(expenses.expenseDate, filter.from));
    if (filter.to) filters.push(lte(expenses.expenseDate, filter.to));
    if (filter.categoryId)
      filters.push(eq(expenses.categoryId, filter.categoryId));
    const where = and(...filters);

    const rows = db
      .select({
        id: expenses.id,
        categoryId: expenses.categoryId,
        categoryName: expenseCategories.name,
        description: expenses.description,
        amountCents: expenses.amountCents,
        paymentMethod: expenses.paymentMethod,
        reference: expenses.reference,
        expenseDate: expenses.expenseDate,
        notes: expenses.notes,
        recordedBy: expenses.recordedBy,
        createdAt: expenses.createdAt,
      })
      .from(expenses)
      .innerJoin(
        expenseCategories,
        eq(expenseCategories.id, expenses.categoryId),
      )
      .where(where)
      .orderBy(desc(expenses.expenseDate), desc(expenses.id))
      .limit(filter.limit)
      .offset(filter.offset)
      .all();

    const total =
      db
        .select({ c: sql<number>`count(*)` })
        .from(expenses)
        .where(where)
        .get()?.c ?? 0;

    return {
      data: rows,
      meta: { total, limit: filter.limit, offset: filter.offset },
    };
  };

  const getExpense = (propertyId: number, id: number) => {
    const row = db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.propertyId, propertyId)))
      .get();
    if (!row) throw new NotFoundError("Expense");
    return row;
  };

  const createExpense = (
    propertyId: number,
    input: {
      categoryId: number;
      description: string;
      amountCents: number;
      paymentMethod?: string;
      reference?: string;
      expenseDate: string;
      notes?: string;
    },
    recordedBy: string | null,
  ) =>
    db
      .insert(expenses)
      .values({
        propertyId,
        categoryId: input.categoryId,
        description: input.description,
        amountCents: input.amountCents,
        paymentMethod: (input.paymentMethod ?? null) as never,
        reference: input.reference ?? null,
        expenseDate: input.expenseDate,
        notes: input.notes ?? null,
        recordedBy,
      })
      .returning()
      .get();

  const updateExpense = (
    propertyId: number,
    id: number,
    patch: Partial<Record<string, unknown>>,
  ) => {
    getExpense(propertyId, id);
    db.update(expenses).set(patch).where(eq(expenses.id, id)).run();
    return getExpense(propertyId, id);
  };

  /* ---------------------------------------------------------------- reports */

  /** Room ids of a property. Bookings belong to a property through their room. */
  const roomIdsFor = (propertyId: number) =>
    db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.propertyId, propertyId))
      .all()
      .map((r) => r.id);

  /** The calendar day a stay ended, in the property's timezone. */
  const checkoutDay = sql`date(${bookings.checkOutDate} / 1000, 'unixepoch')`;

  /** Room revenue plus expenses for a date window. */
  const summary = (propertyId: number, from?: string, to?: string) => {
    const roomIds = roomIdsFor(propertyId);
    const scoped = roomIds.length
      ? inArray(bookings.roomId, roomIds)
      : sql`1 = 0`;

    const bookingFilters = [scoped, eq(bookings.status, "checked_out")];
    if (from) bookingFilters.push(gte(checkoutDay, from) as never);
    if (to) bookingFilters.push(lte(checkoutDay, to) as never);

    const roomRevenue =
      db
        .select({
          total: sql<number>`coalesce(sum(${bookings.totalCostCents}), 0)`,
        })
        .from(bookings)
        .where(and(...bookingFilters))
        .get()?.total ?? 0;

    const expenseFilters = [eq(expenses.propertyId, propertyId)];
    if (from) expenseFilters.push(gte(expenses.expenseDate, from));
    if (to) expenseFilters.push(lte(expenses.expenseDate, to));

    const totalExpenses =
      db
        .select({
          total: sql<number>`coalesce(sum(${expenses.amountCents}), 0)`,
        })
        .from(expenses)
        .where(and(...expenseFilters))
        .get()?.total ?? 0;

    const collected =
      db
        .select({
          total: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
        })
        .from(payments)
        .innerJoin(bookings, eq(bookings.id, payments.bookingId))
        .where(
          and(
            scoped,
            eq(payments.status, "succeeded"),
            eq(payments.type, "payment"),
          ),
        )
        .get()?.total ?? 0;

    const bookingCount =
      db
        .select({ c: sql<number>`count(*)` })
        .from(bookings)
        .where(scoped)
        .get()?.c ?? 0;

    return {
      roomRevenueCents: roomRevenue,
      collectedCents: collected,
      expenseCents: totalExpenses,
      netCents: roomRevenue - totalExpenses,
      bookings: bookingCount,
    };
  };

  /** Revenue grouped by day or month, bucketed on the day a stay ended. */
  const revenue = (
    propertyId: number,
    from: string | undefined,
    to: string | undefined,
    groupBy: "day" | "month",
  ) => {
    const roomIds = roomIdsFor(propertyId);
    const scoped = roomIds.length
      ? inArray(bookings.roomId, roomIds)
      : sql`1 = 0`;
    const bucket = groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";
    // The format string is a fixed internal constant, never user input, so it
    // is inlined rather than bound as a query parameter.
    const bucketExpr = sql`strftime(${sql.raw(`'${bucket}'`)}, ${bookings.checkOutDate} / 1000, 'unixepoch')`;

    const filters = [scoped, eq(bookings.status, "checked_out")];
    if (from) filters.push(gte(checkoutDay, from) as never);
    if (to) filters.push(lte(checkoutDay, to) as never);

    const rows = db
      .select({
        period: sql<string>`${bucketExpr}`,
        totalCents: sql<number>`coalesce(sum(${bookings.totalCostCents}), 0)`,
        bookings: sql<number>`count(*)`,
      })
      .from(bookings)
      .where(and(...filters))
      .groupBy(bucketExpr)
      .orderBy(bucketExpr)
      .all();

    return { groupBy, data: rows };
  };

  return {
    listCategories,
    createCategory,
    listExpenses,
    getExpense,
    createExpense,
    updateExpense,
    summary,
    revenue,
  };
};

export type FinanceService = ReturnType<typeof createFinanceService>;
