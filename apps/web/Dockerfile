# =============================================================================
# apps/web/Dockerfile
# Build context: REPO ROOT (pnpm monorepo — workspace deps needed)
# =============================================================================

# ─── Stage 1: deps ───────────────────────────────────────────────────────────
# Install all workspace dependencies from a frozen lockfile.
# argon2 requires native compilation; Alpine needs build-base + python3.
# Prisma client is generated here (no live DB needed; DATABASE_URL is a
# dummy connection string used only for `prisma generate`).
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat python3 make g++ && \
    corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /repo

# Copy root manifests + lockfile so pnpm can resolve the workspace graph.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy every workspace package.json so pnpm can link the virtual store
# without needing source files yet.
COPY apps/web/package.json         apps/web/package.json
COPY apps/worker/package.json      apps/worker/package.json
COPY packages/db/package.json      packages/db/package.json
COPY packages/shared/package.json  packages/shared/package.json
COPY packages/curation/package.json packages/curation/package.json
COPY packages/email/package.json   packages/email/package.json
COPY packages/delivery/package.json packages/delivery/package.json
COPY packages/brand/package.json   packages/brand/package.json

# Install all deps (including devDeps; needed for prisma generate + build).
# --frozen-lockfile ensures reproducibility.
RUN pnpm install --frozen-lockfile

# Generate Prisma client — only needs schema, not a live database.
COPY packages/db/prisma packages/db/prisma
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" \
    pnpm --filter @mega-bulten/db generate


# ─── Stage 2: builder ────────────────────────────────────────────────────────
# Copy full source and run `next build` with standalone output.
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat python3 make g++ && \
    corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /repo

# Bring installed node_modules from the deps stage.
COPY --from=deps /repo/node_modules         ./node_modules
COPY --from=deps /repo/packages/db/node_modules packages/db/node_modules

# Copy all source files.
COPY . .

# Restore generated Prisma client (prisma generate writes into node_modules).
COPY --from=deps /repo/node_modules/.pnpm   ./node_modules/.pnpm

# Build only the web app. Turbo is not used here to keep the build stage
# deterministic and avoid needing the full turbo cache in CI.
# NEXT_TELEMETRY_DISABLED avoids network calls during build.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mega-bulten/web build


# ─── Stage 3: runner ─────────────────────────────────────────────────────────
# Minimal runtime image: only the Next.js standalone output + argon2 native
# addon. No source, no devDeps, no build tools.
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

# Non-root user for security.
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

# Next standalone output bundles everything it statically traced, but native
# .node addons are not traced by the bundler. Copy argon2's prebuilt/compiled
# binding explicitly into the standalone node_modules tree so `require('argon2')`
# resolves at runtime.
COPY --from=builder --chown=nextjs:nodejs \
    /repo/node_modules/argon2 \
    ./node_modules/argon2

# Copy the standalone server (includes all JS node_modules it traced).
COPY --from=builder --chown=nextjs:nodejs \
    /repo/apps/web/.next/standalone ./

# Copy static assets (CSS, JS chunks served by the standalone server directly).
COPY --from=builder --chown=nextjs:nodejs \
    /repo/apps/web/.next/static \
    ./apps/web/.next/static

# Copy public directory if it exists (Next.js serves it from the standalone
# server when present). This COPY is a no-op if the directory is absent.
# COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3100/api/health || exit 1

# The standalone output places the server entrypoint at
# <rootDir>/apps/web/server.js because the build context is the repo root.
CMD ["node", "apps/web/server.js"]
