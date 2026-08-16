# Multi-stage build cho NestJS + pnpm monorepo
# Stage 1: build (cần devDependencies để chạy nest build + prisma generate)
# Stage 2: prod (chỉ prodDependencies + dist + prisma artifacts)

# ============ Stage 1: build ============
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /repo

# Copy workspace metadata + lockfile để cache layer install
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/types/package.json ./packages/types/package.json

# Install all deps (kể cả devDependencies vì cần nest CLI + tsc)
RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Generate Prisma Client (binary engine dùng openssl trên alpine)
WORKDIR /repo/apps/api
RUN pnpm exec prisma generate

# Build NestJS — dùng tsc builder (đã set trong nest-cli.json, không cần ts-loader)
RUN pnpm build

# Prune devDependencies — chỉ giữ runtime deps
WORKDIR /repo
RUN pnpm prune --prod

# ============ Stage 2: production runtime ============
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

ENV NODE_ENV=production
WORKDIR /app

# Copy pruned workspace + dist + prisma artifacts
COPY --from=builder /repo/package.json /repo/pnpm-workspace.yaml /repo/turbo.json ./
COPY --from=builder /repo/apps/api/package.json ./apps/api/package.json
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/prisma ./apps/api/prisma
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/node_modules ./node_modules

WORKDIR /app/apps/api

# Render inject PORT qua env (mặc định 3001)
EXPOSE 3001

# Healthcheck — gọi swagger endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3001}/api/docs >/dev/null 2>&1 || exit 1

CMD ["node", "dist/main"]
