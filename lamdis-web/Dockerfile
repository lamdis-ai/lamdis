## Dockerfile aligned with working service pattern (classic next start, Node 22)
# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json* yarn.lock* .npmrc* ./
# Install all dependencies including dev (Tailwind, PostCSS)
# NODE_AUTH_TOKEN is injected via BuildKit secret for @lamdis-ai GitHub Packages
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=secret,id=NPM_TOKEN \
    NODE_AUTH_TOKEN=$(cat /run/secrets/NPM_TOKEN 2>/dev/null || echo "") npm ci

FROM base AS build
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public runtime build-time variables (extendable)
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_LAMDIS_API_URL=""
ARG NEXT_PUBLIC_AUTH0_AUDIENCE=""
ARG NEXT_PUBLIC_AUTH0_CLIENT_ID=""
ARG NEXT_PUBLIC_AUTH0_DOMAIN=""
ARG NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE="cloud"
ARG NEXT_PUBLIC_LAMDIS_AUTH_MODE="auth0"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
NEXT_PUBLIC_LAMDIS_API_URL=$NEXT_PUBLIC_LAMDIS_API_URL \
NEXT_PUBLIC_AUTH0_AUDIENCE=$NEXT_PUBLIC_AUTH0_AUDIENCE \
NEXT_PUBLIC_AUTH0_DOMAIN=$NEXT_PUBLIC_AUTH0_DOMAIN \
NEXT_PUBLIC_AUTH0_CLIENT_ID=$NEXT_PUBLIC_AUTH0_CLIENT_ID \
NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE=$NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE \
NEXT_PUBLIC_LAMDIS_AUTH_MODE=$NEXT_PUBLIC_LAMDIS_AUTH_MODE
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 HOSTNAME=0.0.0.0 NODE_OPTIONS="--enable-source-maps"
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json package-lock.json* yarn.lock* ./
COPY --from=deps /app/node_modules ./node_modules
# Remove devDependencies to slim final image
RUN npm prune --production || true
EXPOSE 3000
# JSON form CMD fails fast if process dies (better for health checks)
CMD ["npx","next","start","-p","3000"]
