#!/usr/bin/env bash
set -euo pipefail

##
## Lamdis Health Check
## Verifies that all services are running and responding.
##

API_URL="${API_URL:-http://localhost:3001}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
RUNS_URL="${RUNS_URL:-http://localhost:3101}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_service() {
  local name="$1"
  local url="$2/health"
  local status

  if status=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null); then
    if [ "$status" = "200" ]; then
      echo -e "  ${GREEN}✓${NC} $name ($url) — healthy"
      return 0
    else
      echo -e "  ${YELLOW}!${NC} $name ($url) — HTTP $status"
      return 1
    fi
  else
    echo -e "  ${RED}✗${NC} $name ($url) — unreachable"
    return 1
  fi
}

echo "Lamdis Health Check"
echo "==================="
echo ""

failures=0

check_service "API"  "$API_URL"  || ((failures++))
check_service "Web"  "$WEB_URL"  || ((failures++))
check_service "Runs" "$RUNS_URL" || ((failures++))

echo ""
if [ "$failures" -eq 0 ]; then
  echo -e "${GREEN}All services healthy.${NC}"
  exit 0
else
  echo -e "${RED}$failures service(s) unhealthy.${NC}"
  exit 1
fi
