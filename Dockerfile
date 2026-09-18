# syntax=docker/dockerfile:1

# --- Oberfläche bauen -------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci

COPY . .
RUN npm run build

# --- Laufzeit ---------------------------------------------------------------
FROM node:22-alpine AS runtime

# openssl wird nur gebraucht, wenn im Container ein Zertifikat erzeugt werden
# soll; die Datenbank selbst kommt ohne native Erweiterungen aus (node:sqlite).
RUN apk add --no-cache openssl tini

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    DATABASE_FILE=/data/warensystem.db \
    BACKUP_DIR=/data/backups \
    TLS_KEY_FILE=/certs/server.key \
    TLS_CERT_FILE=/certs/server.crt

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci --omit=dev --workspace server && npm cache clean --force

COPY server ./server
COPY scripts ./scripts
COPY --from=build /app/web/dist ./web/dist

RUN mkdir -p /data /certs && chown -R node:node /data /certs /app
USER node

VOLUME ["/data", "/certs"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const p=process.env.TLS_MODE==='off'?'http':'https';require(p).get({host:'127.0.0.1',port:process.env.PORT,path:'/api/health',rejectUnauthorized:false},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/index.js"]
