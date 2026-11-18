// src/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import type { Db } from "./db";
import * as schema from "./db/schema";
import type { Env } from "./env";

export const createAuth = (db: Db, env: Env) =>
  betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // Disable public sign-ups as per spec
    },
    trustedOrigins: [env.FRONTEND_URL],
    user: {
      additionalFields: {
        role: { type: "string", input: false },
        mustChangePassword: {
          type: "boolean",
          defaultValue: false,
          input: false,
        },
      },
    },
    plugins: [admin()],
  });
export type Auth = ReturnType<typeof createAuth>;
