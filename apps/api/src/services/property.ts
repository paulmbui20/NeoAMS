// src/services/property.ts
// Property settings and the staff roster for one property.
import { and, desc, eq, sql } from "drizzle-orm";
import {
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
} from "../core/errors";
import type { Db } from "../db";
import { properties, propertyStaff } from "../db/schema";
import { user } from "../db/schema/auth";
import type { PropertyRole } from "@neoams/shared";
import type { UsersService } from "./users";

export const createPropertyService = ({
  db,
  users,
}: {
  db: Db;
  users: UsersService;
}) => {
  const get = (propertyId: number) => {
    const property = db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .get();
    if (!property) throw new NotFoundError("Property");
    return property;
  };

  const update = (propertyId: number, patch: Record<string, unknown>) => {
    get(propertyId);
    db.update(properties).set(patch).where(eq(properties.id, propertyId)).run();
    return get(propertyId);
  };

  const listStaff = (propertyId: number) =>
    db
      .select({
        id: propertyStaff.id,
        userId: propertyStaff.userId,
        role: propertyStaff.role,
        name: user.name,
        email: user.email,
        banned: user.banned,
        mustChangePassword: user.mustChangePassword,
        createdAt: propertyStaff.createdAt,
      })
      .from(propertyStaff)
      .innerJoin(user, eq(user.id, propertyStaff.userId))
      .where(eq(propertyStaff.propertyId, propertyId))
      .orderBy(desc(propertyStaff.createdAt))
      .all();

  const countOwners = (propertyId: number) =>
    db
      .select({ c: sql<number>`count(*)` })
      .from(propertyStaff)
      .where(
        and(
          eq(propertyStaff.propertyId, propertyId),
          eq(propertyStaff.role, "owner"),
        ),
      )
      .get()?.c ?? 0;

  const countPropertiesFor = (userId: string) =>
    db
      .select({ c: sql<number>`count(*)` })
      .from(propertyStaff)
      .where(eq(propertyStaff.userId, userId))
      .get()?.c ?? 0;

  /**
   * Add someone to the roster.
   * A new user is created with a temporary password and must change it.
   * An existing user is attached directly.
   */
  const addStaff = async (
    propertyId: number,
    input:
      | { userId: string; role: PropertyRole }
      | {
          name: string;
          email: string;
          tempPassword: string;
          role: PropertyRole;
        },
  ) => {
    get(propertyId);

    const userId =
      "userId" in input
        ? input.userId
        : (
            await users.create({
              name: input.name,
              email: input.email,
              role: "user",
              tempPassword: input.tempPassword,
              mustChangePassword: true,
            })
          ).id;

    const existing = db
      .select()
      .from(propertyStaff)
      .where(
        and(
          eq(propertyStaff.propertyId, propertyId),
          eq(propertyStaff.userId, userId),
        ),
      )
      .get();
    if (existing) {
      throw new ConflictError(
        "ALREADY_ON_ROSTER",
        "That person already works at this property",
      );
    }

    return db
      .insert(propertyStaff)
      .values({ propertyId, userId, role: input.role })
      .returning()
      .get();
  };

  /**
   * Change a role on the roster.
   * Owners manage everyone below them. Promoting to owner, or demoting an
   * owner, is admin-only — so the route passes `actorIsGlobalAdmin`.
   */
  const setRole = (
    propertyId: number,
    staffId: number,
    role: PropertyRole,
    actor: { id: string; role: string; isGlobalAdmin: boolean },
  ) => {
    const row = db
      .select()
      .from(propertyStaff)
      .where(
        and(
          eq(propertyStaff.id, staffId),
          eq(propertyStaff.propertyId, propertyId),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("Staff member");

    if (row.userId === actor.id) {
      throw new ForbiddenError(
        "SELF_EDIT_FORBIDDEN",
        "You cannot change your own role here",
      );
    }

    const isOwnerMove = row.role === "owner" || role === "owner";
    if (isOwnerMove && !actor.isGlobalAdmin) {
      throw new ForbiddenError(
        "OWNER_ADMIN_ONLY",
        "Only an administrator can add or remove an owner",
      );
    }

    if (
      row.role === "owner" &&
      role !== "owner" &&
      countOwners(propertyId) <= 1
    ) {
      throw new InvalidStateError(
        "LAST_OWNER",
        "The last owner of this property cannot be demoted",
      );
    }

    db.update(propertyStaff)
      .set({ role, updatedAt: new Date() })
      .where(eq(propertyStaff.id, staffId))
      .run();

    return db
      .select()
      .from(propertyStaff)
      .where(eq(propertyStaff.id, staffId))
      .get()!;
  };

  /** Remove someone from the roster. The last owner is protected. */
  const removeStaff = (
    propertyId: number,
    staffId: number,
    actor: { id: string; role: string; isGlobalAdmin: boolean },
  ) => {
    const row = db
      .select()
      .from(propertyStaff)
      .where(
        and(
          eq(propertyStaff.id, staffId),
          eq(propertyStaff.propertyId, propertyId),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("Staff member");

    if (row.userId === actor.id) {
      throw new ForbiddenError(
        "SELF_EDIT_FORBIDDEN",
        "You cannot remove yourself from a property",
      );
    }

    if (row.role === "owner" && !actor.isGlobalAdmin) {
      throw new ForbiddenError(
        "OWNER_ADMIN_ONLY",
        "Only an administrator can remove an owner",
      );
    }

    if (row.role === "owner" && countOwners(propertyId) <= 1) {
      throw new InvalidStateError(
        "LAST_OWNER",
        "The last owner of this property cannot be removed",
      );
    }

    db.delete(propertyStaff).where(eq(propertyStaff.id, staffId)).run();
    return { removed: true };
  };

  /**
   * Reset a staff member's password.
   * An owner may only reset someone who works at no other property; otherwise
   * the reset would leak access to properties the owner cannot see.
   */
  const resetPassword = async (
    propertyId: number,
    staffId: number,
    newPassword: string,
    actor: { id: string; role: string; isGlobalAdmin: boolean },
  ) => {
    const row = db
      .select()
      .from(propertyStaff)
      .where(
        and(
          eq(propertyStaff.id, staffId),
          eq(propertyStaff.propertyId, propertyId),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("Staff member");

    if (!actor.isGlobalAdmin && countPropertiesFor(row.userId) > 1) {
      throw new ForbiddenError(
        "MULTI_PROPERTY_RESET",
        "This person works at more than one property; ask an administrator",
      );
    }

    await users.setPassword(row.userId, newPassword);
    users.revokeSessions(row.userId);
    db.update(user)
      .set({ mustChangePassword: true })
      .where(eq(user.id, row.userId))
      .run();
    return { reset: true, userId: row.userId };
  };

  return {
    get,
    update,
    listStaff,
    countOwners,
    addStaff,
    setRole,
    removeStaff,
    resetPassword,
  };
};

export type PropertyService = ReturnType<typeof createPropertyService>;
