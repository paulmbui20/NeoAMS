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

const Env = s.type({
  DB_FILE_NAME: s.string(),
  FRONTEND_URL: s.string(),
  BETTER_AUTH_SECRET: s.string(),
  BETTER_AUTH_URL: s.string(),
  PORT: int(3000),
  TRUST_PROXY: bool(false), // true when behind Caddy/nginx, so IPs (rate limit, audit) are real
  BOOKING_HOLD_MINUTES: int(120), // how long an unpaid online booking holds its room
  PROOF_HOLD_HOURS: int(24), // hold extension once the guest submits proof of payment
});

export const env = s.create({ ...process.env }, Env);
export type Env = s.Infer<typeof Env>;
