#!/usr/bin/env bash
# ==============================================================================
# Automated Nginx & SSL Setup for support.shahil-codex.xyz -> Port 8999
# ==============================================================================

set -e

DOMAIN="support.shahil-codex.xyz"
TARGET_PORT="8999"

echo "=================================================="
echo "Configuring Nginx Reverse Proxy for ${DOMAIN}..."
echo "Target: http://127.0.0.1:${TARGET_PORT}"
echo "=================================================="

# 1. Install Nginx if not installed
if ! command -v nginx &> /dev/null; then
    echo "[INFO] Installing Nginx..."
    apt update && apt install -y nginx
fi

# 2. Ensure directories exist
mkdir -p /etc/nginx/conf.d
mkdir -p /etc/nginx/sites-available
mkdir -p /etc/nginx/sites-enabled

# 3. Write Nginx Configuration
SSL_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
SSL_KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
    echo "[INFO] SSL certificate found at ${SSL_CERT}. Enabling full HTTPS + HTTP..."
    cat > /etc/nginx/conf.d/support.conf << NGINX_CONF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:${TARGET_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 90s;
        proxy_send_timeout 90s;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:${TARGET_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 90s;
        proxy_send_timeout 90s;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
NGINX_CONF
else
    echo "[INFO] SSL certificate not found yet. Configuring HTTP on port 80..."
    cat > /etc/nginx/conf.d/support.conf << NGINX_CONF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:${TARGET_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 90s;
        proxy_send_timeout 90s;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
NGINX_CONF
fi

# Copy to sites-available & symlink to sites-enabled for systems that use it
cp /etc/nginx/conf.d/support.conf /etc/nginx/sites-available/pfg-support 2>/dev/null || true
ln -sf /etc/nginx/conf.d/support.conf /etc/nginx/sites-enabled/support.conf 2>/dev/null || true

# Remove default site to prevent collision
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test syntax and restart
echo "[INFO] Testing Nginx configuration..."
nginx -t

echo "[INFO] Restarting Nginx service..."
systemctl restart nginx || service nginx restart

echo "=================================================="
echo "🎉 SUCCESS! ${DOMAIN} is now live and pointing to port ${TARGET_PORT}!"
echo "Customer Portal: https://${DOMAIN}/"
echo "Admin Dashboard: https://${DOMAIN}/admin"
echo "=================================================="
