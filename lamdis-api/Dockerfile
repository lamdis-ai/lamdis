# syntax=docker/dockerfile:1
#
# Build from monorepo root:
#   docker build -f lamdis-api/Dockerfile .
#

FROM node:22-slim AS base
WORKDIR /app

# --- Dependencies ---
FROM base AS deps

# Copy workspace package files for dependency resolution
COPY package.json package-lock.json ./
COPY lamdis-api/package.json ./lamdis-api/
COPY packages/lamdis-db/package.json ./packages/lamdis-db/
COPY packages/lamdis-sdk/package.json ./packages/lamdis-sdk/

RUN npm ci --workspace=lamdis-api --workspace=@lamdis/db --workspace=@lamdis-ai/sdk

# --- Build ---
FROM base AS build

# Copy hoisted node_modules from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package-lock.json ./

# Copy source
COPY packages/lamdis-db ./packages/lamdis-db
COPY packages/lamdis-sdk ./packages/lamdis-sdk
COPY lamdis-api ./lamdis-api
COPY package.json ./

WORKDIR /app/lamdis-api
RUN npx tsc -p tsconfig.json --noCheck

# --- Runner (Debian slim for Playwright/Chromium) ---
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
    libcairo2 libx11-xcb1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/lamdis-api/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY lamdis-api/package.json ./

RUN npx playwright install chromium

EXPOSE 3100
CMD ["node", "dist/index.js"]
