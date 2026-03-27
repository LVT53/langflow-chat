#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="${APP_DIR:-$(pwd)}"
PM2_APP_NAME="${PM2_APP_NAME:-langflow-chat}"
SYSTEMD_SERVICE_NAME="${SYSTEMD_SERVICE_NAME:-}"
SYSTEMD_USE_SUDO="${SYSTEMD_USE_SUDO:-false}"

SYSTEMCTL_CMD=(systemctl)
if [ "$SYSTEMD_USE_SUDO" = "true" ]; then
  SYSTEMCTL_CMD=(sudo systemctl)
fi

echo -e "${YELLOW}=== Starting deployment ===${NC}"
echo "App directory: $APP_DIR"
echo "PM2 app name: $PM2_APP_NAME"
if [ -n "$SYSTEMD_SERVICE_NAME" ]; then
  echo "Systemd service: $SYSTEMD_SERVICE_NAME"
fi
echo ""

cd "$APP_DIR"

if [ -f .env ]; then
  echo -e "${YELLOW}Loading environment from .env...${NC}"
  set -a
  source .env
  set +a
  echo -e "${GREEN}✓ Environment loaded${NC}"
  echo ""
fi

echo -e "${YELLOW}1. Pulling latest changes...${NC}"
git pull origin main
echo -e "${GREEN}✓ Git pull complete${NC}"
echo ""

echo -e "${YELLOW}2. Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

echo -e "${YELLOW}3. Building application...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

echo -e "${YELLOW}4. Running database migrations...${NC}"
npm run db:prepare
echo -e "${GREEN}✓ Database migrations complete${NC}"
echo ""

if [ -n "$SYSTEMD_SERVICE_NAME" ]; then
  DRAIN_STARTED=0
  clear_drain() {
    if [ "${DRAIN_STARTED:-0}" = "1" ]; then
      echo -e "${YELLOW}Clearing restart drain after interrupted deploy...${NC}"
      node scripts/restart-drain.mjs clear || true
    fi
  }
  trap clear_drain EXIT

  echo -e "${YELLOW}5. Draining new chat turns before restart...${NC}"
  node scripts/restart-drain.mjs start
  DRAIN_STARTED=1
  echo -e "${GREEN}✓ Restart drain activated${NC}"
  echo ""

  echo -e "${YELLOW}6. Waiting for active generations to finish...${NC}"
  node scripts/restart-drain.mjs wait
  echo -e "${GREEN}✓ Safe restart window reached${NC}"
  echo ""

  echo -e "${YELLOW}7. Restarting systemd service...${NC}"
  "${SYSTEMCTL_CMD[@]}" restart "$SYSTEMD_SERVICE_NAME"
  echo -e "${GREEN}✓ Systemd restart complete${NC}"
  echo ""

  DRAIN_STARTED=0
  trap - EXIT

  echo -e "${YELLOW}8. Recent service status...${NC}"
  "${SYSTEMCTL_CMD[@]}" --no-pager --full status "$SYSTEMD_SERVICE_NAME" || true
  echo ""
fi

echo -e "${GREEN}=== Deployment complete! ===${NC}"
