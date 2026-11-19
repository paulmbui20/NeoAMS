// src/http/types.ts
import type { Auth } from "../auth";
import type { Services } from "../container";
import type { StorageProvider } from "../core/storage";
import type { Db } from "../db";
import type { Env } from "../env";
import type { Guards } from "./guards";

export type RouteDeps = {
  services: Services & { db: Db; auth: Auth; storage: StorageProvider };
  guards: Guards;
  env: Env;
};
