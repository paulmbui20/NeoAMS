// src/services/access.ts
import { and, eq } from "drizzle-orm";
import { rolePermissions, type Permission } from "../core/permissions";
import type { Db } from "../db";
import type { PropertyRole } from "../db/enums";
import { properties, propertyStaff } from "../db/schema";

export const createAccessService = ({ db }: { db: Db }) => {
  const roleFor = (userId: string, propertyId: number): PropertyRole | null =>
    db
      .select({ role: propertyStaff.role })
      .from(propertyStaff)
      .where(
        and(
          eq(propertyStaff.userId, userId),
          eq(propertyStaff.propertyId, propertyId),
        ),
      )
      .get()?.role ?? null;

  /** Global admin passes everything. Otherwise the role at *this* property decides. */
  const can = (
    user: { id: string; role: string },
    propertyId: number,
    permission: Permission,
  ) => {
    if (user.role === "admin") return true;
    const role = roleFor(user.id, propertyId);
    return role !== null && rolePermissions[role].has(permission);
  };

  const propertiesFor = (userId: string) =>
    db
      .select({
        id: properties.id,
        name: properties.name,
        slug: properties.slug,
        role: propertyStaff.role,
      })
      .from(propertyStaff)
      .innerJoin(properties, eq(properties.id, propertyStaff.propertyId))
      .where(eq(propertyStaff.userId, userId))
      .all();

  return { roleFor, can, propertiesFor };
};
export type AccessService = ReturnType<typeof createAccessService>;
