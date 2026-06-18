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
# Compile TypeScript → dist/
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat && \
    corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /repo

COPY --from=deps /repo/node_modules         ./node_modules
COPY --from=deps /repo/packages/db/node_modules packages/db/node_modules

COPY . .

# Restore the full pnpm virtual store so workspace symlinks resolve.
COPY --from=deps /repo/node_modules/.pnpm ./node_modules/.pnpm

RUN pnpm --filter @digest/worker build


# ─── Stage 3: runner ─────────────────────────────────────────────────────────
# Slim runtime: only production node_modules + compiled dist/.
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 worker

WORKDIR /app

ENV NODE_ENV=production

# Copy compiled output.
COPY --from=builder --chown=worker:nodejs /repo/apps/worker/dist ./apps/worker/dist

# Copy the full node_modules tree (pnpm hoisted) including workspace packages'
# compiled Prisma client. Production installs are not re-run here to keep the
# image deterministic; the full install from the builder stage is copied.
# An alternative is `pnpm deploy` for a leaner tree, but that requires network
# access or a mounted cache — the full copy is simpler for self-hosted deploy.
COPY --from=builder --chown=worker:nodejs /repo/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /repo/packages     ./packages

USER worker

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('fs').statSync('/app/apps/worker/dist/index.js')" || exit 1

# The worker is an ESM package ("type": "module") compiled to dist/.
CMD ["node", "apps/worker/dist/index.js"]
