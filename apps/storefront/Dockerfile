# ---- ByteHub storefront -------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Baked into the client bundle at build time, so they must be present here and
# not only at runtime.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_ORIGIN
ARG NEXT_PUBLIC_WHATSAPP
ARG NEXT_PUBLIC_PHONE
ARG NEXT_PUBLIC_EMAIL
ARG NEXT_PUBLIC_ADDRESS
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN \
    NEXT_PUBLIC_WHATSAPP=$NEXT_PUBLIC_WHATSAPP \
    NEXT_PUBLIC_PHONE=$NEXT_PUBLIC_PHONE \
    NEXT_PUBLIC_EMAIL=$NEXT_PUBLIC_EMAIL \
    NEXT_PUBLIC_ADDRESS=$NEXT_PUBLIC_ADDRESS \
    NEXT_TELEMETRY_DISABLED=1

# Product pages are pre-rendered here, so the API must be reachable during the
# build and the catalog must already be published. REQUIRE_CATALOG turns an
# unreachable API into a build failure rather than a shop that starts cleanly
# with every product URL 404ing.
ENV REQUIRE_CATALOG=1
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache tini

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
