# apps/web/Dockerfile
# The web image. The SvelteKit app is built with the node adapter, so the
# runtime is plain Node — no Bun needed in the final image.
#
#   docker build -f apps/web/Dockerfile -t neoams-web .
FROM oven/bun:1.4-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/web apps/web

WORKDIR /app/apps/web
RUN bun run build

# --- the runtime -----------------------------------------------------------

FROM node:22-alpine AS runtime

WORKDIR /app
# ORIGIN is overridden at run time by docker compose.
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    ORIGIN=http://localhost:3000

# The adapter-node build and the dependencies it needs at runtime.
COPY --from=build /app/apps/web/build ./build
COPY --from=build /app/apps/web/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "build/index.js"]
