// src/services/admin.ts
// Global administration: properties and user accounts.
// The god account (global admin) is the only role that reaches these.
import { and, desc, eq, sql } from "drizzle-orm";
import {
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
} from "../core/errors";
import type { Db } from "../db";
import { properties, propertyStaff } from "../db/schema";
import type { UserRole } from "@neoams/shared";
import type { UsersService } from "./users";

export const createAdminService = ({
  db,
  users,
}: {
  db: Db;
  users: UsersService;
}) => {
  const listProperties = (query: { limit: number; offset: number }) => {
    const rows = db
      .select()
      .from(properties)
      .orderBy(desc(properties.createdAt))
      .limit(query.limit)
      .offset(query.offset)
      .all();
    const total =
      db
        .select({ c: sql<number>`count(*)` })
        .from(properties)
        .get()?.c ?? 0;
    return {
      data: rows,
      meta: { total, limit: query.limit, offset: query.offset },
    };
  };

  const getProperty = (id: number) => {
    const property = db
      .select()
      .from(properties)
      .where(eq(properties.id, id))
      .get();
    if (!property) throw new NotFoundError("Property");
    return property;
  };

  const slugify = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);

  const uniqueSlug = (base: string) => {
    let candidate = base;
    let n = 1;
    while (
      db.select().from(properties).where(eq(properties.slug, candidate)).get()
    ) {
      candidate = `${base}-${n++}`;
    }
    return candidate;
  };

  /**
   * Create a property and its first owner in one transaction, so a property
   * never exists without somebody able to administer it.
   */
  const createProperty = async (input: {
    name: string;
    slug?: string;
    description?: string;
    country?: string;
    county: string;
    town: string;
    address?: string;
    phone?: string;
    email?: string;
    checkInTime?: string;
    checkOutTime?: string;
    depositPercent?: number;
    owner:
      | { userId: string }
      | { name: string; email: string; tempPassword: string };
  }) => {
    const ownerUserId =
      "userId" in input.owner
        ? input.owner.userId
        : (
            await users.create({
              name: input.owner.name,
              email: input.owner.email,
              role: "user",
              tempPassword: input.owner.tempPassword,
              mustChangePassword: true,
            })
          ).id;

    const ownerExists = users.findById(ownerUserId);
    if (!ownerExists) throw new NotFoundError("User");

    return db.transaction((tx) => {
      const property = tx
        .insert(properties)
        .values({
          name: input.name,
          slug: uniqueSlug(input.slug ?? slugify(input.name)),
          description: input.description ?? null,
          country: input.country ?? "kenya",
          county: input.county,
          town: input.town,
          address: input.address ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          checkInTime: input.checkInTime ?? "14:00",
          checkOutTime: input.checkOutTime ?? "10:00",
          depositPercent: input.depositPercent ?? 30,
        })
        .returning()
        .get();

      tx.insert(propertyStaff)
        .values({ propertyId: property.id, userId: ownerUserId, role: "owner" })
        .run();

      return property;
    });
  };

  const updateProperty = (
    id: number,
    patch: Partial<Record<string, unknown>>,
  ) => {
    getProperty(id);
    db.update(properties).set(patch).where(eq(properties.id, id)).run();
    return getProperty(id);
  };

  /** A property with no owner would be unmanageable, so the last one is protected. */
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

  const assertNotLastOwner = (propertyId: number) => {
    if (countOwners(propertyId) <= 1) {
      throw new InvalidStateError(
        "LAST_OWNER",
        "The last owner of this property cannot be removed",
      );
    }
  };

  /**
   * Only a global admin may touch a global admin.
   * Nobody may change their own role or ban themselves.
   */
  const assertMayManageUser = (
    targetId: string,
    actorId: string,
    actorRole: string,
  ) => {
    if (targetId === actorId) {
      throw new ForbiddenError(
        "SELF_EDIT_FORBIDDEN",
        "You cannot change your own account here",
      );
    }
    const target = users.findById(targetId);
    if (!target) throw new NotFoundError("User");
    if (target.role === "admin" && actorRole !== "admin") {
      throw new ForbiddenError(
        "ADMIN_PROTECTED",
        "Administrators can only be managed by an administrator",
      );
    }
    return target;
  };

  const setUserRole = (
    targetId: string,
    role: UserRole,
    actorId: string,
    actorRole: string,
  ) => {
    assertMayManageUser(targetId, actorId, actorRole);
    return users.setRole(targetId, role, actorId);
  };

  const banUser = (
    targetId: string,
    reason: string | undefined,
    actorId: string,
    actorRole: string,
  ) => {
    assertMayManageUser(targetId, actorId, actorRole);
    users.assertNotLastAdmin(targetId);
    return users.ban(targetId, reason);
  };

  const unbanUser = (targetId: string, actorId: string, actorRole: string) => {
    assertMayManageUser(targetId, actorId, actorRole);
    return users.unban(targetId);
  };

  const resetPassword = async (
    targetId: string,
    newPassword: string,
    actorId: string,
    actorRole: string,
  ) => {
    assertMayManageUser(targetId, actorId, actorRole);
    await users.setPassword(targetId, newPassword);
    users.revokeSessions(targetId);
    return users.findById(targetId)!;
  };

  const revokeSessions = (
    targetId: string,
    actorId: string,
    actorRole: string,
  ) => {
    assertMayManageUser(targetId, actorId, actorRole);
    const n = users.revokeSessions(targetId);
    return { revoked: n };
  };

  const createUser = async (
    input: {
      name: string;
      email: string;
      role?: UserRole;
      tempPassword?: string;
      mustChangePassword?: boolean;
    },
    actorRole: string,
  ) => {
    // Only an admin may mint another admin.
    if (input.role === "admin" && actorRole !== "admin") {
      throw new ForbiddenError(
        "ADMIN_PROTECTED",
        "Only an administrator can create an administrator",
      );
    }
    return users.create(input);
  };

  return {
    listProperties,
    getProperty,
    createProperty,
    updateProperty,
    countOwners,
    assertNotLastOwner,
    assertMayManageUser,
    setUserRole,
    banUser,
    unbanUser,
    resetPassword,
    revokeSessions,
    createUser,
  };
};

export type AdminService = ReturnType<typeof createAdminService>;
