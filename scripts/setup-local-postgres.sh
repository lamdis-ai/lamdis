#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# setup-local-postgres.sh
#
# Sets up a local PostgreSQL database for Lamdis development.
# Uses Docker to run PostgreSQL 16 with persistent data.
#
# Usage: ./setup-local-postgres.sh [start|stop|reset|migrate|status]
# ─────────────────────────────────────────────────────────────────────────────

COMMAND="${1:-start}"
CONTAINER_NAME="lamdis-postgres-dev"
DB_NAME="lamdis"
DB_USER="postgres"
DB_PASSWORD="postgres"
DB_PORT="5432"

case "$COMMAND" in
  start)
    echo "=========================================="
    echo "  Starting Local PostgreSQL for Lamdis"
    echo "=========================================="
    echo ""

    # Check if container already exists
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
      echo "Container ${CONTAINER_NAME} already exists."
      if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "Container is already running."
      else
        echo "Starting existing container..."
        docker start "$CONTAINER_NAME"
      fi
    else
      echo "Creating new PostgreSQL container..."
      docker run -d \
        --name "$CONTAINER_NAME" \
        -e POSTGRES_DB="$DB_NAME" \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASSWORD" \
        -p "${DB_PORT}:5432" \
        -v lamdis-postgres-data:/var/lib/postgresql/data \
        postgres:16-alpine

      echo "Waiting for PostgreSQL to be ready..."
      sleep 3
      docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" || sleep 2
    fi

    echo ""
    echo "PostgreSQL is running!"
    echo ""
    echo "Connection details:"
    echo "  Host:     localhost"
    echo "  Port:     ${DB_PORT}"
    echo "  Database: ${DB_NAME}"
    echo "  User:     ${DB_USER}"
    echo "  Password: ${DB_PASSWORD}"
    echo ""
    echo "Connection string:"
    echo "  DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}"
    echo ""
    echo "Next steps:"
    echo "  1. Update your .env files with the DATABASE_URL above"
    echo "  2. Run migrations: ./setup-local-postgres.sh migrate"
    echo "  3. Start your services: cd lamdis-api && npm run dev"
    echo ""
    ;;

  stop)
    echo "Stopping PostgreSQL container..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || echo "Container not running"
    echo "PostgreSQL stopped."
    ;;

  reset)
    echo "=========================================="
    echo "  WARNING: This will DELETE all data!"
    echo "=========================================="
    echo ""
    read -p "Are you sure you want to reset the database? (yes/no): " CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
      echo "Aborted."
      exit 0
    fi

    echo ""
    echo "Stopping and removing container..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true

    echo "Removing data volume..."
    docker volume rm lamdis-postgres-data 2>/dev/null || true

    echo ""
    echo "Database reset complete."
    echo "Run './setup-local-postgres.sh start' to create a fresh database."
    ;;

  migrate)
    echo "=========================================="
    echo "  Running Database Migrations"
    echo "=========================================="
    echo ""

    export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}"

    # Check if we're in the right directory
    if [[ -d "packages/lamdis-db" ]]; then
      cd packages/lamdis-db
    elif [[ -d "../packages/lamdis-db" ]]; then
      cd ../packages/lamdis-db
    elif [[ -d "lamdis-db" ]]; then
      cd lamdis-db
    else
      echo "ERROR: Could not find packages/lamdis-db directory."
      echo "       Run this script from the project root."
      exit 1
    fi

    echo "Installing dependencies..."
    npm install

    echo "Building package..."
    npm run build

    echo "Generating migrations..."
    npm run generate

    echo "Running migrations..."
    npm run migrate

    echo ""
    echo "✓ Migrations complete!"
    echo ""
    echo "Verify with: psql \"$DATABASE_URL\" -c \"\\dt\""
    ;;

  status)
    echo "PostgreSQL Container Status:"
    echo ""
    if docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep "$CONTAINER_NAME"; then
      echo ""
      echo "✓ Container is running"
      echo ""
      echo "Connection string:"
      echo "  DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}"
    elif docker ps -a --format '{{.Names}}\t{{.Status}}' | grep "$CONTAINER_NAME"; then
      echo ""
      echo "○ Container exists but is not running"
      echo "  Run: ./setup-local-postgres.sh start"
    else
      echo ""
      echo "✗ Container does not exist"
      echo "  Run: ./setup-local-postgres.sh start"
    fi
    echo ""
    ;;

  *)
    echo "Usage: $0 [start|stop|reset|migrate|status]"
    echo ""
    echo "Commands:"
    echo "  start   - Start PostgreSQL container (creates if doesn't exist)"
    echo "  stop    - Stop PostgreSQL container"
    echo "  reset   - Delete all data and remove container"
    echo "  migrate - Run database schema migrations"
    echo "  status  - Check container status"
    echo ""
    exit 1
    ;;
esac
