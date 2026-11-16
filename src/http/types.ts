// src/http/types.ts
import type { Services } from "../container";
import type { Guards } from "./guards";
export type RouteDeps = { services: Services; guards: Guards };
