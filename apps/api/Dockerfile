# Multi-stage build cho NestJS + pnpm monorepo.
#
# QUAN TRỌNG — build context phải là ROOT của monorepo, không phải apps/api,
# vì Dockerfile này cần pnpm-lock.yaml / pnpm-workspace.yaml / packages/*.
#   docker build -f apps/api/Dockerfile .
# Trên Render: Root Directory để TRỐNG, Dockerfile Path = apps/api/Dockerfile.
#
# Stage 1 (builder): full deps → build @foodresq/types + prisma generate + nest build
# Stage 2 (proddeps): chỉ prod deps, cài sạch (không prune)
# Stage 3 (runner) : prod deps + dist + prisma client

# Debian slim thay vì alpine: bcrypt có prebuilt cho glibc (alpine/musl phải
# compile từ source → cần python3/make/g++), và Prisma engine debian-openssl-3.0.x.
ARG NODE_IMAGE=node:20-bookworm-slim

# ============ Stage 1: builder ============
FROM ${NODE_IMAGE} AS builder

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# npm i -g thay vì corepack: corepack bundle trong Node 20 có thể fail
# signature verification với các bản pnpm mới.
RUN npm install -g pnpm@11.8.0

WORKDIR /repo

# Copy workspace metadata + lockfile để cache layer install.
# .npmrc bắt buộc (node-linker=hoisted) và pnpm-lock.yaml bắt buộc (--frozen-lockfile).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
# Mọi workspace project trong lockfile phải có package.json, nếu không pnpm coi
# lockfile là outdated và --frozen-lockfile sẽ fail.
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY packages/types/package.json ./packages/types/package.json

# Chỉ cài deps của api + workspace deps của nó (bỏ qua next/expo của web & mobile)
RUN pnpm install --frozen-lockfile --filter "@foodresq/api..."

# Copy source
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# @foodresq/types trỏ vào ./dist mà dist bị .dockerignore + .gitignore → phải build lại
RUN pnpm --filter @foodresq/types run build

# Prisma generate — không cần DB thật, chỉ cần env var tồn tại để schema parse
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm --filter @foodresq/api run prisma:generate

# Build NestJS — dùng tsc builder (đã set trong nest-cli.json)
RUN pnpm --filter @foodresq/api run build

# ============ Stage 2: prod dependencies ============
FROM ${NODE_IMAGE} AS proddeps

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.8.0

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY packages/types/package.json ./packages/types/package.json

RUN pnpm install --frozen-lockfile --prod --filter "@foodresq/api..."

# ============ Stage 3: production runtime ============
FROM ${NODE_IMAGE} AS runner

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# node_modules sạch (chỉ prod deps) + Prisma Client đã generate ở builder
COPY --from=builder /repo/node_modules ./node_modules


# Workspace layout phải giữ nguyên vì node_modules/@foodresq/types là symlink
# tương đối trỏ về ../../packages/types
COPY --from=builder /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/packages/types/package.json ./packages/types/package.json
COPY --from=builder /repo/packages/types/dist ./packages/types/dist
COPY --from=builder /repo/apps/api/package.json ./apps/api/package.json
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api

# Render inject PORT qua env (mặc định 3001)
EXPOSE 3001

# Healthcheck do Render lo (healthCheckPath). Dùng node fetch để không phụ thuộc wget/curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/docs').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
