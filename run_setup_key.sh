#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "========================================="
echo "   Muse Spark API Key Configuration      "
echo "========================================="
echo ""
echo "This script securely stores your API token in .env.local"
echo "(which is excluded by .gitignore and never committed)."
echo ""

# Prompt for API Key with hidden input (password style)
echo -n "Enter your Muse Spark API Key: "
read -s API_KEY
echo ""

if [ -z "$API_KEY" ]; then
  echo "Error: No API key entered. Aborting."
  exit 1
fi

echo -n "Enter Base URL (Press Enter for default: https://api.aimlapi.com/v1): "
read BASE_URL
if [ -z "$BASE_URL" ]; then
  BASE_URL="https://api.aimlapi.com/v1"
fi

echo -n "Enter Model Name (Press Enter for default: meta/muse-spark-1.2): "
read MODEL_NAME
if [ -z "$MODEL_NAME" ]; then
  MODEL_NAME="meta/muse-spark-1.2"
fi

# Write/Update .env.local securely with 600 permissions
ENV_FILE=".env.local"

# Remove existing keys if present
if [ -f "$ENV_FILE" ]; then
  sed -i.bak '/MUSE_SPARK_/d' "$ENV_FILE" 2>/dev/null || true
  rm -f "${ENV_FILE}.bak" 2>/dev/null || true
fi

cat <<EOF >> "$ENV_FILE"
NEXT_PUBLIC_MUSE_SPARK_BASE_URL="$BASE_URL"
NEXT_PUBLIC_MUSE_SPARK_MODEL="$MODEL_NAME"
MUSE_SPARK_API_KEY="$API_KEY"
NEXT_PUBLIC_MUSE_SPARK_API_KEY="$API_KEY"
EOF

chmod 600 "$ENV_FILE"

echo ""
echo "✓ API key and configuration saved to .env.local (permissions 600)."
echo "✓ Localhost & client autofill are now armed."
