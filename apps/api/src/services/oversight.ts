// src/services/oversight.ts
// The audit trail. Read-only, filtered, paginated.
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { auditLogs } from "../db/schema";

export const createOversightService = ({ db }: { db: Db }) => {
  const list = (filter: {
    entity?: string;
    entityId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
    limit: number;
    offset: number;
  }) => {
    const filters = [];
    if (filter.entity) filters.push(eq(auditLogs.entity, filter.entity));
    if (filter.entityId) filters.push(eq(auditLogs.entityId, filter.entityId));
    if (filter.userId) filters.push(eq(auditLogs.userId, filter.userId));
    if (filter.from) filters.push(gte(auditLogs.createdAt, filter.from));
    if (filter.to) filters.push(lte(auditLogs.createdAt, filter.to));
    const where = filters.length ? and(...filters) : undefined;

    const rows = db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(filter.limit)
      .offset(filter.offset)
      .all()
      .map((r) => ({
        ...r,
        oldValues: r.oldValues ? safeJson(r.oldValues) : null,
        newValues: r.newValues ? safeJson(r.newValues) : null,
      }));

    const total =
      db
        .select({ c: sql<number>`count(*)` })
        .from(auditLogs)
        .where(where)
        .get()?.c ?? 0;

    return {
      data: rows,
      meta: { total, limit: filter.limit, offset: filter.offset },
    };
  };

  const safeJson = (raw: string): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  return { list };
};

export type OversightService = ReturnType<typeof createOversightService>;
