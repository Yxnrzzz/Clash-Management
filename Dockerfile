# Production image for the Next.js frontend (root package, port 3000).
# Multi-stage: deps -> builder -> runner, using `output: "standalone"`
# (next.config.ts) so the runner only needs .next/standalone + static + public
# copied in, not the full node_modules tree.
#
# API_ORIGIN is provided both as a build ARG and a runtime ENV: Next.js
# reads next.config.ts (which reads process.env.API_ORIGIN for the /api/*
# rewrite target) when the standalone server boots, but we also bake it in
# at build time in case a given Next.js version resolves rewrites() during
# `next build` instead. Override at `docker run -e API_ORIGIN=...` time for
# the common case (API reachable at a different host in production).
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
