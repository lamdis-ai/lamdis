#!/bin/bash
#
# Lamdis Local Installer
#
# Run this to get Lamdis running on your desktop in minutes.
# Requires: Docker Desktop (or Docker Engine + Docker Compose)
#
# Usage:
#   curl -fsSL https://get.lamdis.ai | bash
#   — or —
#   ./install.sh
#

set -e

LAMDIS_DIR="${LAMDIS_DIR:-$HOME/.lamdis}"
COMPOSE_FILE="docker-compose.local.yml"
COMPOSE_URL="https://raw.githubusercontent.com/lamdis-ai/lamdis/main/lamdis-deploy/docker-compose/docker-compose.local.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}${BLUE}"
echo "  _                    _ _     "
echo " | |    __ _ _ __ ___ | (_)___ "
echo " | |   / _\` | '_ \` _ \| | / __|"
echo " | |__| (_| | | | | | | | \__ \\"
echo " |_____\__,_|_| |_| |_|_|_|___/"
echo -e "${NC}"
echo -e "${BOLD}  Local Desktop Installer${NC}"
echo ""

# ─── Check prerequisites ───────────────────────────────────────────

check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}Error: $1 is not installed.${NC}"
    echo ""
    echo "$2"
    exit 1
  fi
}

check_command "docker" \
  "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"

# Check Docker is running
if ! docker info &> /dev/null 2>&1; then
  echo -e "${RED}Error: Docker is not running.${NC}"
  echo "Please start Docker Desktop and try again."
  exit 1
fi

# Check docker compose (v2)
if docker compose version &> /dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
  COMPOSE_CMD="docker-compose"
else
  echo -e "${RED}Error: Docker Compose is not available.${NC}"
  echo "Docker Desktop includes Compose v2. Make sure it's enabled."
  exit 1
fi

echo -e "${GREEN}Docker is running.${NC}"
echo ""

# ─── Create install directory ───────────────────────────────────────

echo -e "Installing to ${BOLD}${LAMDIS_DIR}${NC}"
mkdir -p "$LAMDIS_DIR"

# ─── Download compose file ──────────────────────────────────────────

if [ -f "$LAMDIS_DIR/$COMPOSE_FILE" ]; then
  echo -e "${YELLOW}Existing installation found. Updating...${NC}"
fi

# Try to download, fall back to bundled copy
if command -v curl &> /dev/null; then
  curl -fsSL "$COMPOSE_URL" -o "$LAMDIS_DIR/$COMPOSE_FILE" 2>/dev/null || true
elif command -v wget &> /dev/null; then
  wget -qO "$LAMDIS_DIR/$COMPOSE_FILE" "$COMPOSE_URL" 2>/dev/null || true
fi

# If download failed and we have a local copy, use it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -s "$LAMDIS_DIR/$COMPOSE_FILE" ] && [ -f "$SCRIPT_DIR/docker-compose/$COMPOSE_FILE" ]; then
  cp "$SCRIPT_DIR/docker-compose/$COMPOSE_FILE" "$LAMDIS_DIR/$COMPOSE_FILE"
fi

if [ ! -s "$LAMDIS_DIR/$COMPOSE_FILE" ]; then
  echo -e "${RED}Error: Could not download or find compose file.${NC}"
  exit 1
fi

# ─── Pull images ────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}Pulling latest Lamdis images...${NC}"
echo "This may take a few minutes on first install."
echo ""

cd "$LAMDIS_DIR"
$COMPOSE_CMD -f "$COMPOSE_FILE" pull

# ─── Start services ─────────────────────────────────────────────────

echo ""
echo -e "${BLUE}Starting Lamdis...${NC}"
$COMPOSE_CMD -f "$COMPOSE_FILE" up -d

# ─── Wait for health ────────────────────────────────────────────────

echo ""
echo -n "Waiting for services to be ready"
for i in $(seq 1 30); do
  if $COMPOSE_CMD -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
    # Check if web is responding
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
      break
    fi
  fi
  echo -n "."
  sleep 2
done
echo ""

# ─── Done ───────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}Lamdis is running!${NC}"
echo ""
echo -e "  Dashboard:  ${BOLD}http://localhost:3000${NC}"
echo -e "  API:        ${BOLD}http://localhost:3001${NC}"
echo ""
echo -e "  Data is stored in Docker volumes (survives restarts)."
echo ""
echo -e "  ${YELLOW}Commands:${NC}"
echo -e "  Stop:       cd $LAMDIS_DIR && $COMPOSE_CMD -f $COMPOSE_FILE down"
echo -e "  Start:      cd $LAMDIS_DIR && $COMPOSE_CMD -f $COMPOSE_FILE up -d"
echo -e "  Logs:       cd $LAMDIS_DIR && $COMPOSE_CMD -f $COMPOSE_FILE logs -f"
echo -e "  Update:     cd $LAMDIS_DIR && $COMPOSE_CMD -f $COMPOSE_FILE pull && $COMPOSE_CMD -f $COMPOSE_FILE up -d"
echo -e "  Uninstall:  cd $LAMDIS_DIR && $COMPOSE_CMD -f $COMPOSE_FILE down -v && rm -rf $LAMDIS_DIR"
echo ""
