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

echo -e "${YELLOW}3. Applying database migrations...${NC}"
npm run db:prepare
echo -e "${GREEN}✓ Database migrations complete${NC}"
echo ""

echo -e "${YELLOW}5. Building application...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

echo -e "${GREEN}=== Deployment complete! ===${NC}"
