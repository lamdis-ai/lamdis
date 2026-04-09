#!/bin/bash
# Lamdis Development Services Manager
# Usage: ./dev.sh [start|stop|restart|logs|status]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/.logs"
PID_DIR="$SCRIPT_DIR/.pids"

# Service definitions — dir:port:type
# type = node (default), rust, python
declare -A SERVICES=(
  ["api"]="lamdis-api:3001:node"
  ["runs"]="lamdis-runs:3101:node"
  ["web"]="lamdis-web:3000:node"
)

# Windows System32 path (for Git Bash/MSYS)
WIN_SYS32="/c/Windows/System32"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Create directories
mkdir -p "$LOG_DIR" "$PID_DIR"

# Helper: Get PID using port (Windows compatible)
get_pid_by_port() {
  local port=$1
  # Use Windows netstat with full path for Git Bash
  if [[ -x "$WIN_SYS32/NETSTAT.EXE" ]]; then
    "$WIN_SYS32/NETSTAT.EXE" -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}' | head -1
  elif command -v netstat &> /dev/null; then
    netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}' | head -1
  else
    # Fallback: check PID file
    local pid_file="$PID_DIR/$port.pid"
    if [[ -f "$pid_file" ]]; then
      cat "$pid_file"
    fi
  fi
}

# Helper: Kill process on port
kill_port() {
  local port=$1
  local pid=$(get_pid_by_port $port)
  
  if [[ -n "$pid" && "$pid" != "0" ]]; then
    echo -e "${YELLOW}Killing process $pid on port $port...${NC}"
    # Try Windows taskkill first (with full path for Git Bash)
    if [[ -x "$WIN_SYS32/taskkill.exe" ]]; then
      "$WIN_SYS32/taskkill.exe" //PID $pid //F 2>/dev/null || true
    else
      kill $pid 2>/dev/null || true
    fi
    sleep 1
    # Force kill if still running
    if [[ -x "$WIN_SYS32/taskkill.exe" ]]; then
      "$WIN_SYS32/taskkill.exe" //PID $pid //F 2>/dev/null || true
    else
      kill -9 $pid 2>/dev/null || true
    fi
  fi
  
  # Clean up PID file
  rm -f "$PID_DIR/$port.pid" 2>/dev/null
}

# Helper: Check if port is in use
port_in_use() {
  local port=$1
  local pid=$(get_pid_by_port $port)
  [[ -n "$pid" && "$pid" != "0" ]]
}

# Start a service
start_service() {
  local name=$1
  local dir=$2
  local port=$3
  local svc_type=${4:-node}

  echo -e "${BLUE}Starting $name on port $port...${NC}"

  # Kill existing if running
  if port_in_use $port; then
    echo -e "${YELLOW}Port $port in use, stopping existing process...${NC}"
    kill_port $port
    sleep 2
  fi

  local log_file="$LOG_DIR/$name.log"
  local pid_file="$PID_DIR/$port.pid"

  # Clear old log
  > "$log_file"

  # Start the service based on type
  cd "$SCRIPT_DIR/$dir"
  case "$svc_type" in
    rust)
      # Ensure Cargo is on PATH
      export PATH="$HOME/.cargo/bin:$PATH"
      nohup cargo run > "$log_file" 2>&1 &
      ;;
    python)
      # Ensure Python is on PATH
      export PATH="$HOME/AppData/Local/Programs/Python/Python312:$HOME/AppData/Local/Programs/Python/Python312/Scripts:$PATH"
      nohup python -m uvicorn src.main:app --host 0.0.0.0 --port "$port" > "$log_file" 2>&1 &
      ;;
    *)
      nohup npm run dev > "$log_file" 2>&1 &
      ;;
  esac
  local pid=$!
  echo $pid > "$pid_file"

  # Wait a moment and check if it started
  sleep 2
  if kill -0 $pid 2>/dev/null; then
    echo -e "${GREEN}✓ $name started (PID: $pid)${NC}"
  else
    echo -e "${RED}✗ $name failed to start. Check logs: $log_file${NC}"
  fi
}

# Stop a service
stop_service() {
  local name=$1
  local port=$2
  
  echo -e "${YELLOW}Stopping $name on port $port...${NC}"
  kill_port $port
  echo -e "${GREEN}✓ $name stopped${NC}"
}

# Show status
show_status() {
  echo -e "\n${CYAN}=== Service Status ===${NC}\n"
  
  for key in "${!SERVICES[@]}"; do
    IFS=':' read -r dir port svc_type <<< "${SERVICES[$key]}"
    local name="$dir"

    if port_in_use $port; then
      local pid=$(get_pid_by_port $port)
      echo -e "${GREEN}● $name${NC} (port $port) - ${GREEN}Running${NC} (PID: $pid)"
    else
      echo -e "${RED}○ $name${NC} (port $port) - ${RED}Stopped${NC}"
    fi
  done
  echo ""
}

# Start all services
start_all() {
  echo -e "\n${CYAN}=== Starting All Services ===${NC}\n"

  for key in "${!SERVICES[@]}"; do
    IFS=':' read -r dir port svc_type <<< "${SERVICES[$key]}"
    start_service "$dir" "$dir" "$port" "$svc_type"
  done

  echo -e "\n${GREEN}All services started!${NC}"
  echo -e "Logs are in: ${CYAN}$LOG_DIR${NC}"
  echo -e "\nUse ${YELLOW}./dev.sh logs${NC} to view logs"
  echo -e "Use ${YELLOW}./dev.sh logs <service>${NC} to view specific service logs"
  echo -e "Use ${YELLOW}./dev.sh status${NC} to check status"
}

# Stop all services
stop_all() {
  echo -e "\n${CYAN}=== Stopping All Services ===${NC}\n"

  for key in "${!SERVICES[@]}"; do
    IFS=':' read -r dir port svc_type <<< "${SERVICES[$key]}"
    stop_service "$dir" "$port"
  done

  echo -e "\n${GREEN}All services stopped!${NC}"
}

# Show logs
show_logs() {
  local service=$1
  
  if [[ -z "$service" ]]; then
    # Show all logs interleaved (tail all)
    echo -e "${CYAN}=== Tailing all logs (Ctrl+C to stop) ===${NC}\n"
    tail -f "$LOG_DIR"/*.log 2>/dev/null
  else
    # Map short names
    case "$service" in
      api) service="lamdis-api" ;;
      runs) service="lamdis-runs" ;;
      web) service="lamdis-web" ;;
      landing) service="lamdis-landing" ;;
    esac
    
    local log_file="$LOG_DIR/$service.log"
    if [[ -f "$log_file" ]]; then
      echo -e "${CYAN}=== Tailing $service logs (Ctrl+C to stop) ===${NC}\n"
      tail -f "$log_file"
    else
      echo -e "${RED}Log file not found: $log_file${NC}"
      echo -e "Available logs:"
      ls -la "$LOG_DIR" 2>/dev/null
    fi
  fi
}

# Show recent logs (last N lines)
show_recent() {
  local lines=${1:-50}
  
  echo -e "${CYAN}=== Recent Logs (last $lines lines each) ===${NC}\n"
  
  for key in "${!SERVICES[@]}"; do
    IFS=':' read -r dir port svc_type <<< "${SERVICES[$key]}"
    local log_file="$LOG_DIR/$dir.log"

    if [[ -f "$log_file" ]]; then
      echo -e "\n${YELLOW}--- $dir ---${NC}"
      tail -n $lines "$log_file" 2>/dev/null
    fi
  done
}

# Interactive menu
show_menu() {
  echo -e "\n${CYAN}╔════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}     ${YELLOW}Lamdis Development Manager${NC}         ${CYAN}║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════╝${NC}\n"
  
  show_status
  
  echo -e "${CYAN}Commands:${NC}"
  echo -e "  ${GREEN}1${NC}) Start all services"
  echo -e "  ${GREEN}2${NC}) Stop all services"
  echo -e "  ${GREEN}3${NC}) Restart all services"
  echo -e "  ${GREEN}4${NC}) View logs (all)"
  echo -e "  ${GREEN}5${NC}) View logs (api)"
  echo -e "  ${GREEN}6${NC}) View logs (runs)"
  echo -e "  ${GREEN}7${NC}) View logs (web)"
  echo -e "  ${GREEN}8${NC}) Show recent logs"
  echo -e "  ${GREEN}9${NC}) Refresh status"
  echo -e "  ${GREEN}q${NC}) Quit"
  echo ""
  read -p "Select option: " choice
  
  case $choice in
    1) start_all; show_menu ;;
    2) stop_all; show_menu ;;
    3) stop_all; sleep 2; start_all; show_menu ;;
    4) show_logs ;;
    5) show_logs "api" ;;
    6) show_logs "runs" ;;
    7) show_logs "web" ;;
    8) show_recent 100; show_menu ;;
    9) show_menu ;;
    q|Q) echo -e "${GREEN}Bye!${NC}"; exit 0 ;;
    *) echo -e "${RED}Invalid option${NC}"; show_menu ;;
  esac
}

# Main
case "${1:-menu}" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
    sleep 2
    start_all
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs "$2"
    ;;
  recent)
    show_recent "${2:-50}"
    ;;
  menu|"")
    show_menu
    ;;
  *)
    echo -e "${CYAN}Lamdis Development Manager${NC}"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start     Start all services"
    echo "  stop      Stop all services"
    echo "  restart   Restart all services"
    echo "  status    Show service status"
    echo "  logs      Tail all logs"
    echo "  logs <s>  Tail specific service (api, runs, web)"
    echo "  recent    Show recent logs (last 50 lines)"
    echo "  menu      Interactive menu (default)"
    echo ""
    ;;
esac
