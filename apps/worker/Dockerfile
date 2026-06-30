# =============================================================================
# apps/worker/Dockerfile
# Build context: REPO ROOT (pnpm monorepo — workspace deps needed)
# =============================================================================

# ─── Stage 1: deps ───────────────────────────────────────────────────────────
# Install all workspace dependencies. The worker does NOT use argon2 (native
# addon), so no build tools are needed — but libc6-compat is still required
# for some Node binary addons that may be pulled in transitively.
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat && \
    corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY apps/web/package.json         apps/web/package.json
COPY apps/worker/package.json      apps/worker/package.json
COPY packages/db/package.json      packages/db/package.json
COPY packages/shared/package.json  packages/shared/package.json
COPY packages/curation/package.json packages/curation/package.json
COPY packages/email/package.json   packages/email/package.json
COPY packages/delivery/package.json packages/delivery/package.json
COPY packages/brand/package.json   packages/brand/package.json

RUN pnpm install --frozen-lockfile

# Generate Prisma client for the worker — same schema, no live DB needed.
COPY packages/db/prisma packages/db/prisma
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" \
    pnpm --filter @digest/db generate


# ─── Stage 2: builder ────────────────────────────────────────────────────────
# Assemble the full source tree + node_modules. The worker is run via tsx (no
# compile step): the workspace packages are TypeScript-source-only (their exports
# point at src/*.ts), so a bare `node dist/…` cannot load them — tsx resolves
# both the .ts sources and the extensionless imports the same way dev does.
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat && \
    corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /repo

COPY --from=deps /repo/node_modules         ./node_modules
COPY --from=deps /repo/packages/db/node_modules packages/db/node_modules

COPY . .

# Restore the full pnpm virtual store so workspace symlinks resolve.
COPY --from=deps /repo/node_modules/.pnpm ./node_modules/.pnpm

# Type-check the worker (no emit) so a broken build still fails the image.
RUN pnpm --filter @digest/worker type-check


# ─── Stage 3: runner ─────────────────────────────────────────────────────────
# Slim runtime: only production node_modules + compiled dist/.
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 worker

WORKDIR /app

ENV NODE_ENV=production

# Copy the worker source (run via tsx, not a compiled dist) + its package.json
# and tsconfig.
COPY --from=builder --chown=worker:nodejs /repo/apps/worker/src ./apps/worker/src
COPY --from=builder --chown=worker:nodejs /repo/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder --chown=worker:nodejs /repo/apps/worker/tsconfig.json ./apps/worker/tsconfig.json
COPY --from=builder --chown=worker:nodejs /repo/tsconfig.base.json ./tsconfig.base.json

# Copy the full node_modules tree (pnpm hoisted) — includes tsx and the workspace
# packages' generated Prisma client. Production installs are not re-run here to
# keep the image deterministic; the full install from the builder stage is copied.
COPY --from=builder --chown=worker:nodejs /repo/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /repo/packages     ./packages

USER worker

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('fs').statSync('/app/apps/worker/src/index.ts')" || exit 1

# Run the TypeScript entrypoint directly via tsx (resolves .ts workspace sources
# + extensionless imports, matching dev). tsx is in the copied node_modules.
CMD ["node_modules/.bin/tsx", "apps/worker/src/index.ts"]
