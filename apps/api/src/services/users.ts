// src/services/users.ts
// User lifecycle shared by the admin area and property staff management.
// Every rule that prevents privilege escalation lives here, not in a route.
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import {
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
} from "../core/errors";
import type { Db } from "../db";
import { account, session, user } from "../db/schema/auth";
import type { UserRole } from "@neoams/shared";
import type { Auth } from "../auth";

export const createUsersService = ({ db, auth }: { db: Db; auth: Auth }) => {
  const countAdmins = () =>
    db
      .select({ c: sql<number>`count(*)` })
      .from(user)
      .where(eq(user.role, "admin"))
      .get()?.c ?? 0;

  const findById = (id: string) =>
    db.select().from(user).where(eq(user.id, id)).get();

  const findByEmail = (email: string) =>
    db.select().from(user).where(eq(user.email, email)).get();

  /**
   * Create a user. `tempPassword` implies the user must change it at first sign-in.
   * The email uniqueness is enforced by the DB, but we check first so we can
   * answer with a code the UI understands.
   */
  const create = async (input: {
    name: string;
    email: string;
    role?: UserRole;
    tempPassword?: string;
    mustChangePassword?: boolean;
  }) => {
    if (findByEmail(input.email)) {
      throw new ConflictError(
        "EMAIL_IN_USE",
        "That email is already registered",
      );
    }
    const password = input.tempPassword;
    if (!password) {
      throw new InvalidStateError(
        "PASSWORD_REQUIRED",
        "A temporary password is required",
      );
    }
    const created = (await auth.api.createUser({
      body: {
        email: input.email,
        password,
        name: input.name,
        role: input.role ?? "user",
      },
    } as never)) as unknown as { user: { id: string } };
    const id = created.user.id;
    if (input.mustChangePassword) {
      db.update(user)
        .set({ mustChangePassword: true })
        .where(eq(user.id, id))
        .run();
    }
    return findById(id)!;
  };

  /** Set a new password directly on the credential account. */
  const setPassword = async (userId: string, newPassword: string) => {
    const target = findById(userId);
    if (!target) throw new NotFoundError("User");
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(newPassword);
    const cred = db
      .select({ id: account.id })
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.providerId, "credential")),
      )
      .get();
    if (!cred) {
      // No credential account yet: create one so the user can sign in.
      await auth.api.createUser({
        body: {
          email: target.email,
          password: newPassword,
          name: target.name,
          role: target.role as UserRole,
        },
      } as never);
      return;
    }
    db.update(account)
      .set({ password: hash, updatedAt: new Date() })
      .where(eq(account.id, cred.id))
      .run();
  };

  /** Drop every active session. Used on ban and on password reset. */
  const revokeSessions = (userId: string) => {
    const res = db.delete(session).where(eq(session.userId, userId)).run();
    return res.changes ?? 0;
  };

  const ban = (userId: string, reason?: string) => {
    const target = findById(userId);
    if (!target) throw new NotFoundError("User");
    db.update(user)
      .set({ banned: true, banReason: reason ?? null, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .run();
    revokeSessions(userId);
    return findById(userId)!;
  };

  const unban = (userId: string) => {
    const target = findById(userId);
    if (!target) throw new NotFoundError("User");
    db.update(user)
      .set({
        banned: false,
        banReason: null,
        banExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId))
      .run();
    return findById(userId)!;
  };

  const setName = (userId: string, name: string) => {
    const target = findById(userId);
    if (!target) throw new NotFoundError("User");
    db.update(user)
      .set({ name, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .run();
    return findById(userId)!;
  };

  /**
   * Change the global role. Guards the last admin and self-demotion.
   * `actorId` is the person making the change.
   */
  const setRole = (userId: string, role: UserRole, actorId: string) => {
    const target = findById(userId);
    if (!target) throw new NotFoundError("User");
    if (target.id === actorId) {
      throw new ForbiddenError(
        "SELF_EDIT_FORBIDDEN",
        "You cannot change your own role",
      );
    }
    if (target.role === "admin" && role !== "admin" && countAdmins() <= 1) {
      throw new InvalidStateError(
        "LAST_ADMIN",
        "The last admin cannot be demoted",
      );
    }
    db.update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .run();
    return findById(userId)!;
  };

  /** The same last-admin rule, for bans. */
  const assertNotLastAdmin = (userId: string) => {
    const target = findById(userId);
    if (!target) throw new NotFoundError("User");
    if (target.role === "admin" && countAdmins() <= 1) {
      throw new InvalidStateError(
        "LAST_ADMIN",
        "The last admin cannot be banned",
      );
    }
  };

  const list = (query: {
    q?: string;
    role?: UserRole;
    limit: number;
    offset: number;
  }) => {
    const filters = [];
    if (query.q) {
      const pattern = `%${query.q}%`;
      filters.push(or(like(user.name, pattern), like(user.email, pattern)));
    }
    if (query.role) filters.push(eq(user.role, query.role));
    const where = filters.length ? and(...filters) : undefined;
    const rows = db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        mustChangePassword: user.mustChangePassword,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(query.limit)
      .offset(query.offset)
      .all();
    const total =
      db
        .select({ c: sql<number>`count(*)` })
        .from(user)
        .where(where)
        .get()?.c ?? 0;
    return {
      data: rows,
      meta: { total, limit: query.limit, offset: query.offset },
    };
  };

  return {
    countAdmins,
    findById,
    findByEmail,
    create,
    setName,
    setPassword,
    revokeSessions,
    ban,
    unban,
    setRole,
    assertNotLastAdmin,
    list,
  };
};

export type UsersService = ReturnType<typeof createUsersService>;
