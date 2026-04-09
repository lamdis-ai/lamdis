# syntax=docker/dockerfile:1
#
# Build from monorepo root:
#   docker build -f lamdis-runs/Dockerfile .
#

FROM node:22-alpine AS base
WORKDIR /app

# --- Dependencies ---
FROM base AS deps

COPY package.json package-lock.json ./
COPY lamdis-runs/package.json ./lamdis-runs/
COPY packages/lamdis-db/package.json ./packages/lamdis-db/

RUN npm ci --workspace=lamdis-runs --workspace=@lamdis/db

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/lamdis-runs/node_modules ./lamdis-runs/node_modules 2>/dev/null || true
COPY --from=deps /app/packages/lamdis-db/node_modules ./packages/lamdis-db/node_modules 2>/dev/null || true

COPY packages/lamdis-db ./packages/lamdis-db
COPY lamdis-runs ./lamdis-runs
COPY package.json ./

WORKDIR /app/lamdis-runs
RUN npx tsc -p tsconfig.json --noCheck

# --- Production ---
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/lamdis-runs/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY lamdis-runs/package.json ./

EXPOSE 3101
CMD ["node", "dist/index.js"]
