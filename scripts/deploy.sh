#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="${APP_DIR:-$(pwd)}"
PM2_APP_NAME="${PM2_APP_NAME:-langflow-chat}"

echo -e "${YELLOW}=== Starting deployment ===${NC}"
echo "App directory: $APP_DIR"
echo "PM2 app name: $PM2_APP_NAME"
echo ""

cd "$APP_DIR"

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
npx drizzle-kit push
echo -e "${GREEN}✓ Database migrations complete${NC}"
echo ""

echo -e "${YELLOW}5. Restarting application...${NC}"
if pm2 list | grep -q "$PM2_APP_NAME"; then
    pm2 reload "$PM2_APP_NAME"
    echo -e "${GREEN}✓ Application reloaded${NC}"
else
    echo -e "${RED}⚠ PM2 app '$PM2_APP_NAME' not found${NC}"
    echo "Start manually: pm2 start ecosystem.config.cjs"
fi
echo ""

echo -e "${GREEN}=== Deployment complete! ===${NC}"
echo "Check logs: pm2 logs $PM2_APP_NAME"
