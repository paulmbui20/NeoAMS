// src/env.ts
import * as s from "superstruct";

const int = (fallback: number) =>
  s.defaulted(
    s.coerce(s.integer(), s.string(), (v) => Number(v)),
    fallback,
  );
const bool = (fallback: boolean) =>
  s.defaulted(
    s.coerce(s.boolean(), s.string(), (v) => v === "true"),
    fallback,
  );
/** A number from the environment, with a fallback and a range. */
const boundedInt = (fallback: number, min: number, max: number) =>
  s.defaulted(
    s.size(
      s.coerce(s.integer(), s.string(), (v) => Number(v)),
      min,
      max,
    ),
    fallback,
  );

const Env = s.type({
  DB_FILE_NAME: s.string(),
  FRONTEND_URL: s.string(),
  BETTER_AUTH_SECRET: s.string(),
  BETTER_AUTH_URL: s.string(),
  PORT: int(3000),
  TRUST_PROXY: bool(false), // true when behind Caddy/nginx, so IPs (rate limit, audit) are real
  BOOKING_HOLD_MINUTES: int(120), // how long an unpaid online booking holds its room
  PROOF_HOLD_HOURS: int(24), // hold extension once the guest submits proof of payment
  // Optional. When set, POST /setup demands this exact token, so an exposed
  // fresh install cannot be claimed by whoever finds it first.
  SETUP_TOKEN: s.optional(s.string()),
  UPLOAD_DIR: s.defaulted(s.string(), "./uploads"),
  MAX_UPLOAD_BYTES: int(5 * 1024 * 1024), // 5 MB per image
  // The sign-in rate limit. It is on in production; the test suite turns it
  // off, because it signs in far more often than any person would.
  RATE_LIMIT_ENABLED: bool(true),
  // How many sign-in attempts one address may make a minute.
  RATE_LIMIT_SIGN_IN_MAX: boundedInt(10, 1, 100),
});

export const env = s.create({ ...process.env }, Env);
export type Env = s.Infer<typeof Env>;
