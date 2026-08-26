# ---- ByteHub catalog API -----------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run unprivileged. node:alpine already ships a `node` user.
RUN apk add --no-cache tini
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node catalog ./catalog

# Product photos are read from disk at request time. Mounted as a volume in
# compose so new photos do not require an image rebuild.
COPY --chown=node:node ["New Catalog", "./New Catalog"]

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps zombies and forwards signals, so the graceful shutdown in
# server.js actually receives SIGTERM.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
