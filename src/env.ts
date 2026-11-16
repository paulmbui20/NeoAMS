import { coerce, create, defaulted, number, string, type } from "superstruct";

const Env = type({
  DB_FILE_NAME: string(),
  FRONTEND_URL: string(),
  BETTER_AUTH_SECRET: string(), // read by Better Auth itself; validated here so boot fails loudly
  BETTER_AUTH_URL: string(),
  PORT: defaulted(
    coerce(number(), string(), (v) => Number(v)),
    3000,
  ),
});

export const env = create(process.env, Env);
