# Lookback — single-container deploy: Fastify API + worker + built PWA.
# The server serves web/dist itself, so one service = whole product.

FROM node:22-slim

# sharp's prebuilt libvips needs these at runtime on slim images
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Install with the lockfile first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile

COPY . .

# Build the PWA. VITE_API_BASE defaults to '' (same origin) in production.
RUN pnpm --filter @lookback/web build

ENV NODE_ENV=production
EXPOSE 8080

# Migrate (idempotent, pgvector-optional) then start API + in-process worker.
CMD ["sh", "-c", "pnpm --filter @lookback/server migrate && pnpm --filter @lookback/server start"]
