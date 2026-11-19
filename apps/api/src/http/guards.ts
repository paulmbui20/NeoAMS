// src/http/guards.ts
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";
import type { Auth } from "../auth";
import type { Actor } from "../core/actor";
import { ForbiddenError, UnauthorizedError } from "../core/errors";
import type { Permission } from "@neoams/shared";
import type { AccessService } from "../services/access";
import { parse, PropertyParams } from "@neoams/shared";

export type SessionUser = {
  id: string;
  role: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  banned?: boolean | null;
};
declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser;
    actor: Actor;
  }
}

export const createGuards = ({
  auth,
  access,
}: {
  auth: Auth;
  access: AccessService;
}) => {
  const sessionUser = async (
    req: FastifyRequest,
  ): Promise<SessionUser | null> =>
    (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }))
      ?.user ?? null;

  /**
   * Any signed-in user (guest accounts included).
   * A user who must change their password is allowed in, but only on the
   * routes that let them do it.
   */
  const requireUser = async (req: FastifyRequest) => {
    const user = await sessionUser(req);
    if (!user) throw new UnauthorizedError();
    if (user.banned) {
      throw new ForbiddenError(
        "ACCOUNT_BANNED",
        "This account has been suspended",
      );
    }
    if (user.mustChangePassword && !isPasswordChangeRoute(req)) {
      throw new ForbiddenError(
        "PASSWORD_CHANGE_REQUIRED",
        "Change your password before continuing",
      );
    }
    req.user = user;
    req.actor = { userId: user.id, ip: req.ip };
  };

  /** Public routes: attach the account if there is one, never fail. */
  const optionalActor = async (req: FastifyRequest): Promise<Actor> => ({
    userId: (await sessionUser(req))?.id ?? null,
    ip: req.ip,
  });

  /** Staff routes: signed in AND allowed to do `permission` at the property in the URL. */
  const can = (permission: Permission) => async (req: FastifyRequest) => {
    await requireUser(req);
    const { propertyId } = parse(PropertyParams, req.params);
    if (!access.can(req.user, propertyId, permission)) {
      throw new ForbiddenError("FORBIDDEN", "You are not allowed to do this");
    }
  };

  return { requireUser, optionalActor, can };
};
export type Guards = ReturnType<typeof createGuards>;

/**
 * While a password change is pending these are the only routes that work.
 * Everything else answers 403 PASSWORD_CHANGE_REQUIRED.
 */
const PASSWORD_CHANGE_ALLOWED = [
  "/api/v1/me",
  "/api/v1/me/password",
  "/api/auth/",
];

const isPasswordChangeRoute = (req: FastifyRequest): boolean => {
  const url = (req.url ?? "").split("?")[0] ?? "";
  return PASSWORD_CHANGE_ALLOWED.some(
    (allowed) =>
      url === allowed ||
      (allowed.endsWith("/") && url.startsWith(allowed)) ||
      (!allowed.endsWith("/") && url.startsWith(`${allowed}/`)),
  );
};
