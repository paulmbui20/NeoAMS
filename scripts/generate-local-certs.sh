#!/usr/bin/env bash
# scripts/generate-local-certs.sh — generate local TLS certificates with mkcert
#
# This script generates certificates for neoams.local and *.neoams.local
# for local development with Traefik.
#
# Prerequisites:
#   - mkcert (https://github.com/FiloSottile/mkcert)
#   - nss tools (for Firefox support)
#
# Usage:
#   ./scripts/generate-local-certs.sh
#
# The certificates will be placed in ./certs/ which is mounted by Traefik.

set -euo pipefail

CERTS_DIR="$(dirname "$0")/../certs"
DOMAIN="neoams.local"

mkdir -p "$CERTS_DIR"

echo "Generating local certificates for $DOMAIN..."

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    echo "Error: mkcert is not installed."
    echo "Install it with:"
    echo "  brew install mkcert nss  # macOS"
    echo "  sudo apt install libnss3-tools && go install github.com/FiloSottile/mkcert@latest  # Linux"
    exit 1
fi

# Install the local CA if not already installed
mkcert -install

# Generate certificates
mkcert -cert-file "$CERTS_DIR/neoams.local.pem" -key-file "$CERTS_DIR/neoams.local-key.pem" \
    "$DOMAIN" "*.$DOMAIN" "localhost" "127.0.0.1" "::1"

echo ""
echo "Certificates generated in $CERTS_DIR:"
ls -la "$CERTS_DIR"
echo ""
echo "To use with Traefik, add these entries to /etc/hosts:"
echo "127.0.0.1 neoams.local traefik.neoams.local"
echo "::1 neoams.local traefik.neoams.local"
echo ""
echo "Then start the stack with:"
echo "  docker compose -f docker-compose.local.yml up -d"