# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
ARG DIRECTUS_URL
ARG DIRECTUS_ADMIN_TOKEN
RUN npm run build
RUN npm prune --production

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup -S shelf && adduser -S shelf -G shelf

COPY --from=builder --chown=shelf:shelf /app/build        ./build
COPY --from=builder --chown=shelf:shelf /app/node_modules ./node_modules
COPY --from=builder --chown=shelf:shelf /app/package.json ./

USER shelf
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "build"]
