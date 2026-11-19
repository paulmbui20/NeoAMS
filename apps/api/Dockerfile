# apps/api/Dockerfile
# The API image. Built from the repository root, because Bun workspaces
# install the whole tree at once.
#
#   docker build -f apps/api/Dockerfile -t neoams-api .
FROM oven/bun:1.4-alpine

WORKDIR /app

# The manifests first: the dependency layer is cached until they change.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

# The code.
COPY packages/shared packages/shared
COPY apps/api apps/api

# The SQLite file and the uploaded images live here, on a volume.
ENV DB_FILE_NAME=/data/neoams.sqlite \
    UPLOAD_DIR=/data/uploads \
    NODE_ENV=production

RUN mkdir -p /data/uploads
VOLUME ["/data"]

WORKDIR /app/apps/api
EXPOSE 3000

# The schema is brought up to date on start, so a fresh volume is enough.
CMD ["bun", "src/server.ts"]
