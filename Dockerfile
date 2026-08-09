# Production image for the Next.js frontend (root package, port 3000).
# Multi-stage: deps -> builder -> runner, using `output: "standalone"`
# (next.config.ts) so the runner only needs .next/standalone + static + public
# copied in, not the full node_modules tree.
#
# API_ORIGIN must be correct at BUILD time, not just runtime. Verified
# empirically against a real production image (Next.js 16.3.0): rewrites()
# is evaluated once during `next build` and the resulting destination is
# baked into the standalone output — `docker run -e API_ORIGIN=...` with a
# different value at runtime is silently ignored (confirmed by pointing a
# running container at a nonexistent host via that env var and watching
# /api/* still resolve to the build-time target). The runtime ENV below
# exists only so the value is visible via `docker inspect`/`docker exec env`,
# not because the app reads it again after boot. If you need a different API
# host, rebuild the image with a different --build-arg API_ORIGIN — don't
# rely on overriding it at `docker run`/compose time.
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ARG API_ORIGIN=http://localhost:3001
ENV API_ORIGIN=${API_ORIGIN}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG API_ORIGIN=http://localhost:3001
ENV API_ORIGIN=${API_ORIGIN}
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
