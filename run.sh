#!/usr/bin/env bash
set -e

# Change directory to the repository folder
cd "$(dirname "$0")"

PORT="${PORT:-3000}"

echo "========================================="
echo "   SMP Application Tracker - Launcher    "
echo "========================================="


# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting Admissions & Programs Tracker on http://localhost:${PORT}..."
exec npx next dev -p "${PORT}"
