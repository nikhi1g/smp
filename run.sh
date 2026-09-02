#!/usr/bin/env bash
set -e

# Change directory to the script's folder
cd "$(dirname "$0")"

PORT="${PORT:-3000}"

echo "========================================="
echo "  SMP Application Tracker - Localhost"
echo "========================================="

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting Next.js development server on http://localhost:${PORT}..."
exec npx next dev -p "${PORT}"
