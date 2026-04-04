FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable
# OpenSSL is needed for Prisma to detect the correct engine binary
RUN apk add --no-cache openssl

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

# Copy Prisma schema before install so the postinstall `prisma generate` can find it
COPY apps/api/src/prisma apps/api/src/prisma

RUN pnpm install --no-frozen-lockfile

COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

RUN pnpm --filter @betintel/shared build
RUN pnpm --filter api build

FROM node:20-alpine AS runner
# Chromium removed — scraping uses HTTP APIs only (The Odds API + Kambi CDN)
RUN apk add --no-cache ca-certificates openssl

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/src/prisma ./apps/api/prisma
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
# With node-linker=hoisted, pnpm symlinks @betintel/shared → ../../packages/shared.
# Docker BuildKit resolves that symlink at COPY time (before the shared build ran),
# so node_modules/@betintel/shared may be empty. Override it with the real built output.
COPY --from=builder /app/packages/shared/package.json ./node_modules/@betintel/shared/package.json
COPY --from=builder /app/packages/shared/dist ./node_modules/@betintel/shared/dist

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/index.js"]