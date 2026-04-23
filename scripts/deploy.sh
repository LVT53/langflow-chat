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

echo -e "${YELLOW}2b. Setting up Python sandbox environment...${NC}"
if [ -f /usr/bin/python3.11 ]; then
  if [ ! -d sandbox-python-env ]; then
    /usr/bin/python3.11 -m venv sandbox-python-env
  fi
  sandbox-python-env/bin/pip install --quiet --upgrade pip 2>/dev/null || true
  sandbox-python-env/bin/pip install --quiet openpyxl xlsxwriter python-docx python-pptx 2>/dev/null || true
  echo -e "${GREEN}✓ Python sandbox packages installed${NC}"
else
  echo -e "${YELLOW}⚠ python3.11 not found; Python sandbox file generation may be limited${NC}"
fi
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
