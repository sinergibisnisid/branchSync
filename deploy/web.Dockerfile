# Image web: build frontend React (Vite) lalu sajikan hasilnya dengan Caddy.
# Build dari root repo: docker compose -f deploy/docker-compose.yml build caddy
FROM node:22.11.0-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM caddy:2.10.0-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/ /srv/
