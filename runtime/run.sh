#!/bin/bash

# Zhentan Runtime PM2 Deployment Script
# Run from repo root: ./runtime/run.sh <command>
#
# The runtime is the agent service (D1–D4): it screens transactions and
# holds the ONLY threshold-bearing key. runtime/.env must carry
# RUNTIME_API_URL, RUNTIME_API_TOKEN, AGENT_PRIVATE_KEY (and optionally
# RUNTIME_RPC_URL / AGENT_INSTANCE_ID / HEALTH_PORT) — see .env.example.

set -e

RUNTIME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$RUNTIME_DIR")"

cd "$ROOT_DIR"

case "$1" in
  "install")
    echo "Installing PM2 globally..."
    npm install -g pm2
    echo "PM2 installed!"
    ;;
  "build")
    echo "Building Zhentan runtime (screening core first)..."
    pnpm install
    pnpm --filter zhentan-screening build
    pnpm --filter zhentan-runtime build
    echo "Runtime build complete!"
    ;;
  "start")
    echo "Starting Zhentan runtime with PM2..."
    if [ ! -f runtime/.env ]; then
      echo "ERROR: runtime/.env missing — copy .env.example and set RUNTIME_API_TOKEN + AGENT_PRIVATE_KEY."
      exit 1
    fi
    mkdir -p runtime/logs
    pm2 start runtime/ecosystem.config.cjs --env production
    pm2 save
    echo "Runtime started! Health: curl 127.0.0.1:\${HEALTH_PORT:-3002}/health"
    ;;
  "startup")
    echo "Configuring PM2 to start on boot..."
    pm2 startup
    pm2 save
    echo "PM2 will now start automatically on boot!"
    ;;
  "stop")
    echo "Stopping Zhentan runtime..."
    pm2 stop zhentan-runtime
    echo "Runtime stopped! (Screened proposals will queue until restart — fail-closed.)"
    ;;
  "restart")
    echo "Restarting Zhentan runtime..."
    pm2 restart zhentan-runtime
    echo "Runtime restarted!"
    ;;
  "logs")
    pm2 logs zhentan-runtime
    ;;
  "health")
    curl -s "127.0.0.1:${HEALTH_PORT:-3002}/health" && echo
    ;;
  "monitor")
    pm2 monit
    ;;
  "status")
    pm2 status
    ;;
  "update")
    echo "Updating runtime..."
    git pull
    pnpm install
    pnpm --filter zhentan-screening build
    pnpm --filter zhentan-runtime build
    pm2 restart zhentan-runtime
    echo "Update complete!"
    ;;
  "delete")
    echo "Deleting PM2 process..."
    pm2 delete zhentan-runtime
    echo "Process deleted!"
    ;;
  *)
    echo "Usage: $0 {install|build|start|startup|stop|restart|logs|health|monitor|status|update|delete}"
    echo ""
    echo "Commands:"
    echo "  install  - Install PM2 globally"
    echo "  build    - Install deps and build screening core + runtime"
    echo "  start    - Start runtime with PM2 (requires runtime/.env)"
    echo "  startup  - Configure PM2 to start on boot"
    echo "  stop     - Stop runtime (screened proposals queue: fail-closed)"
    echo "  restart  - Restart runtime"
    echo "  logs     - View runtime logs"
    echo "  health   - Query the localhost health endpoint"
    echo "  monitor  - Open PM2 monitoring dashboard"
    echo "  status   - Show PM2 status"
    echo "  update   - Pull latest code, build, and restart"
    echo "  delete   - Remove runtime from PM2"
    exit 1
    ;;
esac
