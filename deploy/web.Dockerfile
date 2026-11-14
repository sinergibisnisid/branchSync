# Image caddy berisi file frontend saja (bukan server/, dokumen, atau .git).
# Build dari root repo: docker compose -f deploy/docker-compose.yml build caddy
FROM caddy:2.10.0-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY index.html script.js mode.js styles.css admin.css admin-content.js admin-i18n.js /srv/
COPY admin/ /srv/admin/
