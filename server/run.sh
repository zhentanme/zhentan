#!/bin/bash

# Zhentan Server PM2 Deployment Script
# Run from repo root: ./server/run.sh <command>

set -e

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SERVER_DIR")"

cd "$ROOT_DIR"

case "$1" in
  "install")
    echo "Installing PM2 globally..."
    npm install -g pm2
    echo "PM2 installed!"
    ;;
  "build")
    echo "Building Zhentan server (screening core first)..."
    pnpm install
    pnpm --filter zhentan-screening build
    pnpm --filter zhentan-server build
    echo "Building server complete!"
    ;;
  "start")
    echo "Starting Zhentan server with PM2..."
    mkdir -p server/logs
    pm2 start server/ecosystem.config.cjs --env production
    pm2 save
    echo "Server started!"
    ;;
  "startup")
    echo "Configuring PM2 to start on boot..."
    pm2 startup
    pm2 save
    echo "PM2 will now start automatically on boot!"
    ;;
  "stop")
    echo "Stopping Zhentan server..."
    pm2 stop zhentan-server
    echo "Server stopped!"
    ;;
  "restart")
    echo "Restarting Zhentan server..."
    pm2 restart zhentan-server
    echo "Server restarted!"
    ;;
  "reload")
    echo "Reloading server (zero-downtime)..."
    pm2 reload zhentan-server
    echo "Server reloaded!"
    ;;
  "logs")
    pm2 logs zhentan-server
    ;;
  "monitor")
    pm2 monit
    ;;
  "status")
    pm2 status
    ;;
  "update")
    echo "Updating server..."
    git pull
    pnpm install
    pnpm --filter zhentan-screening build
    pnpm --filter zhentan-server build
    pm2 reload zhentan-server
    echo "Update complete!"
    ;;
  "delete")
    echo "Deleting PM2 process..."
    pm2 delete zhentan-server
    echo "Process deleted!"
    ;;
  *)
    echo "Usage: $0 {install|build|start|startup|stop|restart|reload|logs|monitor|status|update|delete}"
    echo ""
    echo "Commands:"
    echo "  install  - Install PM2 globally"
    echo "  build    - Install deps and build server"
    echo "  start    - Start server with PM2"
    echo "  startup  - Configure PM2 to start on boot"
    echo "  stop     - Stop server"
    echo "  restart  - Restart server"
    echo "  reload   - Zero-downtime reload"
    echo "  logs     - View server logs"
    echo "  monitor  - Open PM2 monitoring dashboard"
    echo "  status   - Show PM2 status"
    echo "  update   - Pull latest code, build, and reload"
    echo "  delete   - Remove server from PM2"
    exit 1
    ;;
esac
