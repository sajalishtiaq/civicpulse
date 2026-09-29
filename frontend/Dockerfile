# ---------- builder ----------
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- final ----------
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh \
    && addgroup -S civicpulse && adduser -S civicpulse -G civicpulse \
    && chown -R civicpulse:civicpulse /usr/share/nginx/html /var/cache/nginx /var/run \
    && touch /var/run/nginx.pid && chown civicpulse:civicpulse /var/run/nginx.pid

USER civicpulse

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O - http://localhost:80 || exit 1

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]