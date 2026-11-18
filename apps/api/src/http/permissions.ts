import type { Permission } from "@neoams/shared";
import type { SessionUser } from "./guards";

export const hasPermission = (
  user: SessionUser,
  permission: Permission,
  propertyRole: string | null,
) => {
  if (user.role === "admin") return true;
  if (!propertyRole) return false;
  // This would typically call the shared rolePermissions map
  return true; // Placeholder for now, implementation is in the shared package
};
