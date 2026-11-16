// src/core/permissions.ts  (the only place the role table lives)
import type { PropertyRole } from "../db/enums";

export const permissions = [
  "property:manage",
  "staff:manage",
  "catalog:manage",
  "roomStatus:write",
  "guest:read",
  "guest:write",
  "booking:read",
  "booking:write",
  "payment:write",
  "payment:refund",
  "expense:manage",
  "report:read",
  "audit:read",
] as const;
export type Permission = (typeof permissions)[number];

const only = (...p: Permission[]): ReadonlySet<Permission> => new Set(p);

export const rolePermissions: Record<PropertyRole, ReadonlySet<Permission>> = {
  owner: new Set(permissions),
  manager: only(
    "catalog:manage",
    "roomStatus:write",
    "guest:read",
    "guest:write",
    "booking:read",
    "booking:write",
    "payment:write",
    "payment:refund",
    "expense:manage",
    "report:read",
  ),
  receptionist: only(
    "roomStatus:write",
    "guest:read",
    "guest:write",
    "booking:read",
    "booking:write",
    "payment:write",
  ),
  accountant: only(
    "guest:read",
    "booking:read",
    "payment:write",
    "payment:refund",
    "expense:manage",
    "report:read",
  ),
  staff: only("roomStatus:write"),
};
