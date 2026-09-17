#!/usr/bin/env bash
set -e

echo "Healthcare Portal - Local Setup"
echo "================================"

echo -e "\n[1/5] Installing root development tooling..."
cd "$(dirname "$0")/.."
npm install

echo -e "\n[2/5] Starting PostgreSQL..."
docker compose up -d
sleep 5

echo -e "\n[3/5] Setting up server..."
cd server
[ -f .env ] || cp .env.example .env
npm install

echo -e "\n[4/5] Initializing database..."
npm run db:init

echo -e "\n[5/5] Setting up client..."
cd ../client
[ -f .env ] || cp .env.example .env
npm install

cd ..
echo -e "\nSetup complete! Run: cd server && npm run dev  |  cd client && npm run dev"
