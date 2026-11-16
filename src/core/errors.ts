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
  constructor() {
    super(403, "FORBIDDEN", "You are not allowed to do this");
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
