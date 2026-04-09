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
COPY lamdis-api/package.json ./lamdis-api/
COPY lamdis-runs/package.json ./lamdis-runs/
COPY lamdis-web/package.json ./lamdis-web/
COPY packages/lamdis-db/package.json ./packages/lamdis-db/
COPY packages/lamdis-sdk/package.json ./packages/lamdis-sdk/
COPY packages/lamdis-ui/package.json ./packages/lamdis-ui/
COPY packages/lamdis-shared-web/package.json ./packages/lamdis-shared-web/
COPY packages/lamdis-mcp/package.json ./packages/lamdis-mcp/
COPY packages/lamdis-connect/package.json ./packages/lamdis-connect/

RUN npm ci

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY packages/lamdis-db ./packages/lamdis-db
COPY lamdis-runs ./lamdis-runs
COPY package.json ./
WORKDIR /app/lamdis-runs
RUN npx tsc -p tsconfig.json --noCheck

# --- Runner ---
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/lamdis-runs/node_modules ./lamdis-runs/node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/lamdis-runs/dist ./lamdis-runs/dist
COPY lamdis-runs/package.json ./lamdis-runs/package.json

WORKDIR /app/lamdis-runs
EXPOSE 3101
CMD ["node", "dist/index.js"]
