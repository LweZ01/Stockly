FROM node:22-alpine AS base

RUN npm install -g npm@11

# ---- Etapa 1: dependencias de producción ----
FROM base AS deps-prod

ENV NODE_ENV=production

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Etapa 2: build ----
FROM base AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Etapa 3: runtime ----
FROM base AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

COPY --from=deps-prod --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --chown=app:app package.json ./

USER app

EXPOSE 3000

CMD ["node", "dist/main.js"]