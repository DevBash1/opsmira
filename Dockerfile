# Opsmira: web app build, then a small runtime image with the server.
FROM node:25-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:25-slim
# ssh is how Opsmira reads and manages other servers.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-client ca-certificates procps \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    OPSMIRA_DATA_DIR=/data \
    OPSMIRA_WEB_DIR=/app/dist
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server
COPY server/src ./server/src
COPY --from=web /app/dist ./dist
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/me').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.js"]
