# Run from project root: .\scripts\setup.ps1

Write-Host "Healthcare Portal - Local Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# 1. Install root development tooling
Write-Host "`n[1/5] Installing root development tooling..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\.."
npm install
if ($LASTEXITCODE -ne 0) { exit 1 }

# 2. Start PostgreSQL via Docker
Write-Host "`n[2/5] Starting PostgreSQL..." -ForegroundColor Yellow
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker failed. Install Docker Desktop or set DATABASE_URL manually." -ForegroundColor Red
    exit 1
}

Write-Host "Waiting for PostgreSQL to be ready..."
Start-Sleep -Seconds 5

# 3. Server setup
Write-Host "`n[3/5] Setting up server..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\..\server"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created server/.env from .env.example"
}

npm install
if ($LASTEXITCODE -ne 0) { exit 1 }

# 4. Initialize database
Write-Host "`n[4/5] Initializing database schema & seed data..." -ForegroundColor Yellow
npm run db:init
if ($LASTEXITCODE -ne 0) { exit 1 }

# 5. Client setup
Write-Host "`n[5/5] Setting up client..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\..\client"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created client/.env from .env.example"
}

npm install
if ($LASTEXITCODE -ne 0) { exit 1 }

Set-Location "$PSScriptRoot\.."

Write-Host "`nSetup complete!" -ForegroundColor Green
Write-Host "--------------------------------"
Write-Host "Start services in separate terminals:"
Write-Host "  Terminal 1: cd server && npm run dev"
Write-Host "  Terminal 2: cd client && npm run dev"
Write-Host "  Terminal 3: cd ai-service && python main.py  (optional)"
Write-Host ""
Write-Host "App:     http://localhost:5173"
Write-Host "API:     http://localhost:5000"
Write-Host "AI:      http://localhost:8000"
Write-Host ""
Write-Host "Demo login: patient@demo.com / password123" -ForegroundColor Cyan
