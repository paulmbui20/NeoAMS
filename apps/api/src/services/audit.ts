// src/services/audit.ts
import type { Actor } from "../core/actor";
import type { Conn } from "../db";
import { auditLogs } from "../db/schema";

export const createAuditService = () => ({
  /** tx-first. Keep before/after small and free of PII. */
  log(
    c: Conn,
    e: {
      actor: Actor;
      action: string;
      entity: string;
      entityId: number | string;
      before?: unknown;
      after?: unknown;
    },
  ) {
    c.insert(auditLogs)
      .values({
        userId: e.actor.userId,
        action: e.action,
        entity: e.entity,
        entityId: String(e.entityId),
        oldValues: e.before === undefined ? null : JSON.stringify(e.before),
        newValues: e.after === undefined ? null : JSON.stringify(e.after),
        ipAddress: e.actor.ip ?? null,
      })
      .run();
  },
});
export type AuditService = ReturnType<typeof createAuditService>;
