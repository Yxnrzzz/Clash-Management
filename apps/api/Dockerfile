# Production image for the NestJS backend (apps/api, port 3001, prefix /api).
# Multi-stage: deps -> builder -> runner.
#
# `prisma generate` runs in the builder stage (same stage as `nest build`,
# not split off) so the generated client matches what TypeScript compiled
# against. `prisma/` (schema + migrations) is copied into the runner so
# `prisma migrate deploy` can be run at container start/deploy time — this
# image does not run migrations itself, see docker-compose.prod.yml.
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Fresh production-only install (not `npm prune` on the builder's
# node_modules — prune's handling of the non-package `.prisma/` generated
# client directory isn't something to rely on). The prisma-client-js
# generator writes the actual schema-specific client code into
# node_modules/.prisma/client at `generate` time, which a plain
# `npm ci --omit=dev` here would NOT recreate (prisma the CLI is a
# devDependency, deliberately not installed in this stage) — so it's
# copied over from the builder stage explicitly.
#
# The `prisma` CLI itself (also a devDependency) is copied over the same
# way, together with the rest of the @prisma/* scope it depends on
# (engines, fetch-engine, ...) — `docker compose exec api npx prisma
# migrate deploy` is the documented deploy step (see docker-compose.prod.yml),
# and without this it would try to download the CLI from the network at
# deploy time, which fails outright on an air-gapped host and is an
# unnecessary external dependency on any host.
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# Lampiran disimpan di disk lokal lewat StorageService — arahkan ke volume
# terpisah saat menjalankan container (lihat docker-compose.prod.yml).
ENV UPLOAD_DIR=/app/uploads

RUN addgroup --system --gid 1001 nestjs \
  && adduser --system --uid 1001 nestjs

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

RUN mkdir -p /app/uploads && chown -R nestjs:nestjs /app/uploads

USER nestjs
EXPOSE 3001

CMD ["node", "dist/main"]
