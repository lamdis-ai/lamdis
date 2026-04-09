# syntax=docker/dockerfile:1
#
# Build from monorepo root:
#   docker build -f lamdis-api/Dockerfile .
#

FROM node:22-slim AS base
WORKDIR /app

# --- Dependencies ---
FROM base AS deps

# Copy root workspace config + ALL workspace package.jsons
# npm ci needs all of them to resolve the lockfile
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
COPY packages/lamdis-sdk ./packages/lamdis-sdk
COPY lamdis-api ./lamdis-api
COPY package.json ./
WORKDIR /app/lamdis-api
RUN npx tsc -p tsconfig.json --noCheck

# --- Runner ---
FROM node:22-slim AS runner
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
    libcairo2 libx11-xcb1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/lamdis-api/node_modules ./lamdis-api/node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/lamdis-api/dist ./lamdis-api/dist
COPY lamdis-api/package.json ./lamdis-api/package.json

RUN npx playwright install chromium

WORKDIR /app/lamdis-api
EXPOSE 3100
CMD ["node", "dist/index.js"]
