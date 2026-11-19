// scripts/routes.ts — print every registered route, for the curl sweep.
import { buildApp } from "../src/app";
import { createContainer } from "../src/container";
import { env } from "../src/env";

const container = createContainer(env);
const app = buildApp(container);
await app.ready();

const routes = app
  .printRoutes({ commonPrefix: false })
  .split("\n")
  .filter((l) => l.includes("(") || l.includes("›"));

const out: string[] = [];
for (const line of routes) {
  const m = line.match(/(?:│\s*)?([A-Z]+)\s*\|?\s*(\/\S*)/);
  if (m) out.push(`${m[1]!.padEnd(6)} ${m[2]}`);
}
console.log(out.join("\n"));
await app.close();
process.exit(0);
