# Nkhondo game server (Node 20 + TypeScript, REST + WebSocket).
# Built with repo-root context so /shared is included:
#   docker build -f server/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
COPY shared/package.json ./shared/
RUN cd server && npm ci
COPY server/src ./server/src
COPY server/tsconfig.json ./server/tsconfig.json
COPY server/data ./server/data
COPY shared ./shared
RUN cd server && npm run build

FROM node:20-alpine AS run
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev
# compiled output keeps the repo layout: server/dist/{server,shared}/...
COPY --from=build /app/server/dist ./server/dist
EXPOSE 8080
CMD ["node", "server/dist/server/src/index.js"]
