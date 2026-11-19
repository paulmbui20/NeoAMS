// src/core/errors.ts
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown, code = "VALIDATION_FAILED") {
    super(400, code, message, details);
  }
}
export class UnauthorizedError extends AppError {
  constructor() {
    super(401, "UNAUTHORIZED", "Sign in required");
  }
}
export class ForbiddenError extends AppError {
  constructor(code = "FORBIDDEN", message = "You are not allowed to do this") {
    super(403, code, message);
  }
}
export class NotFoundError extends AppError {
  constructor(what: string) {
    super(404, "NOT_FOUND", `${what} not found`);
  }
}
export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}
export class InvalidStateError extends AppError {
  constructor(code: string, message: string) {
    super(422, code, message);
  }
}

/**
 * Is this a "that row already exists" error?
 * SQLite reports it as SQLITE_CONSTRAINT_UNIQUE, but Drizzle wraps the
 * driver error, so the whole chain is checked.
 */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    const e = current as { code?: string; message?: string; cause?: unknown };
    if (e.code === "SQLITE_CONSTRAINT_UNIQUE") return true;
    if (
      typeof e.message === "string" &&
      e.message.includes("UNIQUE constraint failed")
    ) {
      return true;
    }
    current = e.cause;
  }
  return false;
}
