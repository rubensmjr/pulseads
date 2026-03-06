#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Pulse Ads — Script de instalação automática para VPS
#  Ubuntu 20.04 / 22.04
#  Uso: bash install.sh
# ═══════════════════════════════════════════════════════

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

echo -e "${BLUE}"
echo "  ██████╗ ██╗   ██╗██╗     ███████╗███████╗     █████╗ ██████╗ ███████╗"
echo "  ██╔══██╗██║   ██║██║     ██╔════╝██╔════╝    ██╔══██╗██╔══██╗██╔════╝"
echo "  ██████╔╝██║   ██║██║     ███████╗█████╗      ███████║██║  ██║███████╗"
echo "  ██╔═══╝ ██║   ██║██║          ██║██╔══╝      ██╔══██║██║  ██║╚════██║"
echo "  ██║     ╚██████╔╝███████╗███████║███████╗    ██║  ██║██████╔╝███████║"
echo "  ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝    ╚═╝  ╚═╝╚═════╝ ╚══════╝"
echo -e "${NC}"
echo -e "${GREEN}Instalação automática do Pulse Ads SaaS${NC}"
echo ""

# ── Verifica root ────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Execute como root: sudo bash install.sh${NC}"
  exit 1
fi

# ── Coleta informações ───────────────────────────────
echo -e "${YELLOW}Vamos configurar seu servidor. Responda as perguntas:${NC}"
echo ""

read -p "Seu domínio ou IP (ex: pulseads.com ou 123.456.789.0): " DOMAIN
read -p "Email do admin: " ADMIN_EMAIL
read -s -p "Senha do admin: " ADMIN_PASSWORD; echo ""
read -p "Usar HTTPS com SSL? (s/n) [requer domínio]: " USE_SSL

# Gera chaves aleatórias
JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64)
ENC_KEY=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)

echo ""
echo -e "${BLUE}[1/6] Atualizando sistema...${NC}"
apt-get update -qq && apt-get upgrade -y -qq

echo -e "${BLUE}[2/6] Instalando Node.js 20...${NC}"
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - -qq
  apt-get install -y -qq nodejs
fi
echo "  Node: $(node --version) | NPM: $(npm --version)"

echo -e "${BLUE}[3/6] Instalando Nginx e PM2...${NC}"
apt-get install -y -qq nginx
npm install -g pm2 -q

echo -e "${BLUE}[4/6] Configurando aplicação...${NC}"
APP_DIR="/var/www/pulseads"
mkdir -p $APP_DIR
cp -r . $APP_DIR/
cd $APP_DIR/backend

# Cria .env
cat > .env << EOF
PORT=3000
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENC_KEY}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
DB_PATH=/var/www/pulseads/data/pulseads.db
ALLOWED_ORIGIN=https://${DOMAIN}
EOF

mkdir -p /var/www/pulseads/data
npm install --production -q
echo "  ✅ Dependências instaladas"

echo -e "${BLUE}[5/6] Configurando Nginx...${NC}"
if [[ "$USE_SSL" =~ ^[Ss]$ ]]; then
  # HTTPS config
  cat > /etc/nginx/sites-available/pulseads << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl http2;
    server_name ${DOMAIN};
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
else
  # HTTP config
  cat > /etc/nginx/sites-available/pulseads << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
fi

ln -sf /etc/nginx/sites-available/pulseads /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t -q && systemctl reload nginx
echo "  ✅ Nginx configurado"

# SSL
if [[ "$USE_SSL" =~ ^[Ss]$ ]]; then
  echo -e "${BLUE}     Obtendo certificado SSL...${NC}"
  apt-get install -y -qq certbot python3-certbot-nginx
  certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $ADMIN_EMAIL -q || echo "  ⚠️  SSL: configure manualmente após instalação"
fi

echo -e "${BLUE}[6/6] Iniciando serviço com PM2...${NC}"
cd $APP_DIR/backend
pm2 start server.js --name pulseads --env production
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash
echo "  ✅ PM2 configurado"

# ── Firewall ─────────────────────────────────────────
ufw allow 80/tcp -q
ufw allow 443/tcp -q
ufw allow 22/tcp -q
echo "y" | ufw enable -q 2>/dev/null || true

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Pulse Ads instalado com sucesso!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
if [[ "$USE_SSL" =~ ^[Ss]$ ]]; then
  echo -e "  🌐 Acesse: ${BLUE}https://${DOMAIN}${NC}"
else
  echo -e "  🌐 Acesse: ${BLUE}http://${DOMAIN}${NC}"
fi
echo ""
echo -e "  👤 Admin: ${YELLOW}${ADMIN_EMAIL}${NC}"
echo -e "  🔐 Senha: ${YELLOW}${ADMIN_PASSWORD}${NC}"
echo ""
echo -e "  📋 Comandos úteis:"
echo -e "     pm2 status          → ver status"
echo -e "     pm2 logs pulseads   → ver logs"
echo -e "     pm2 restart pulseads → reiniciar"
echo ""
echo -e "${YELLOW}  ⚠️  Troque a senha do admin no primeiro login!${NC}"
echo ""
