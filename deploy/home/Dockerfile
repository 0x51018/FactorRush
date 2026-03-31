FROM node:22-bookworm-slim AS builder

WORKDIR /app
ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL="${NEXT_PUBLIC_SERVER_URL}"

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-bookworm-slim AS runtime-base

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps ./apps
COPY --from=builder --chown=node:node /app/packages ./packages

USER node

FROM runtime-base AS web-runner

EXPOSE 3000
WORKDIR /app/apps/web
CMD ["npm", "run", "start"]

FROM runtime-base AS server-runner

EXPOSE 3001
WORKDIR /app/apps/server
CMD ["npm", "run", "start"]
