#!/bin/sh
set -e

cat <<EOF > /usr/share/nginx/html/config.js
window.APP_CONFIG = {
  API_BASE_URL: "${API_BASE_URL:-}"
};
EOF

exec nginx -g "daemon off;"