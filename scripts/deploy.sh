#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="${APP_DIR:-$(pwd)}"
PM2_APP_NAME="${PM2_APP_NAME:-langflow-chat}"
DB_CHANGED=0

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
PRE_DEPLOY_HEAD="$(git rev-parse HEAD)"
git pull origin main
POST_DEPLOY_HEAD="$(git rev-parse HEAD)"

if [ "$PRE_DEPLOY_HEAD" != "$POST_DEPLOY_HEAD" ]; then
  if git diff --name-only "$PRE_DEPLOY_HEAD" "$POST_DEPLOY_HEAD" -- \
    drizzle \
    src/lib/server/db/schema.ts \
    scripts/prepare-db.ts \
    drizzle.config.ts | grep -q .; then
    DB_CHANGED=1
  fi
fi

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

if [ "$DB_CHANGED" -eq 1 ]; then
  echo -e "${YELLOW}4. Database changes detected; applying migrations...${NC}"
  npm run db:prepare
  echo -e "${GREEN}✓ Database migrations complete${NC}"
  echo ""
else
  echo -e "${YELLOW}4. No database changes detected; skipping migrations${NC}"
  echo ""
fi

echo -e "${GREEN}=== Deployment complete! ===${NC}"
