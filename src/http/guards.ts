// src/http/guards.ts
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";
import type { Auth } from "../auth";
import type { Actor } from "../core/actor";
import { ForbiddenError, UnauthorizedError } from "../core/errors";
import type { Permission } from "../core/permissions";
import type { AccessService } from "../services/access";
import { parse, PropertyParams } from "../validation/common";

export type SessionUser = {
  id: string;
  role: string;
  name: string;
  email: string;
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

  /** Any signed-in user (guest accounts included). */
  const requireUser = async (req: FastifyRequest) => {
    const user = await sessionUser(req);
    if (!user) throw new UnauthorizedError();
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
    if (!access.can(req.user, propertyId, permission))
      throw new ForbiddenError();
  };

  return { requireUser, optionalActor, can };
};
export type Guards = ReturnType<typeof createGuards>;
