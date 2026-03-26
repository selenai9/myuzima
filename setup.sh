#!/bin/bash

ENV_FILE=".env"

if [ -f "$ENV_FILE" ]; then
    echo "⚠️  $ENV_FILE already exists. Stopping to protect existing keys."
    exit 1
fi

echo "🔐 Generating unique security keys for MyUZIMA..."

# Generate 32-byte (256-bit) random hex strings
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
DB_ROOT_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
DB_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

cat <<EOF > $ENV_FILE
# Database (Internal)
DB_ROOT_PASSWORD=$DB_ROOT_PASSWORD
DB_NAME=myuzima
DB_USER=mu_admin
DB_PASSWORD=$DB_PASSWORD

# Security Secrets
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY

# API Config
NODE_ENV=production
PORT=3000
VITE_APP_ID=myuzima_pwa_v1

# External APIs (PASTE YOUR KEYS HERE)
OAUTH_SERVER_URL=
OWNER_OPEN_ID=
OWNER_NAME=
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=
VITE_FRONTEND_FORGE_API_KEY=
EOF

echo "✅ .env file created successfully."
