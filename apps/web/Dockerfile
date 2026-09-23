# Build context is the repo root (pnpm workspace), not apps/web.
# docker compose build --> dockerfile: apps/web/Dockerfile, context: .

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---- install workspace dependencies (cached while only manifests change) ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN pnpm install --frozen-lockfile

# ---- full source, deps already installed: used for build and for one-off db scripts ----
FROM deps AS repo
COPY . .

# ---- production build of the web app ----
FROM repo AS builder
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

# ---- minimal runtime image ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /repo/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1
CMD ["node", "apps/web/server.js"]
