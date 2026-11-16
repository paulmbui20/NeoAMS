import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { env } from "./env";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: { enabled: true },
  trustedOrigins: [env.FRONTEND_URL],
  user: {
    additionalFields: {
      // exposes role on the session, but clients can never set it at sign-up
      role: { type: "string", input: false },
    },
  },
});
