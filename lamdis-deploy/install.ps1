#
# Lamdis Local Installer for Windows
#
# Run this to get Lamdis running on your desktop in minutes.
# Requires: Docker Desktop for Windows
#
# Usage:
#   .\install.ps1
#

$ErrorActionPreference = "Stop"

$LamdisDir = if ($env:LAMDIS_DIR) { $env:LAMDIS_DIR } else { Join-Path $env:USERPROFILE ".lamdis" }
$ComposeFile = "docker-compose.local.yml"
$ComposeUrl = "https://raw.githubusercontent.com/lamdis-ai/lamdis/main/lamdis-deploy/docker-compose/docker-compose.local.yml"

Write-Host ""
Write-Host "  _                    _ _     " -ForegroundColor Blue
Write-Host " | |    __ _ _ __ ___ | (_)___ " -ForegroundColor Blue
Write-Host " | |   / _`` | '_ `` _ \| | / __|" -ForegroundColor Blue
Write-Host " | |__| (_| | | | | | | | \__ \" -ForegroundColor Blue
Write-Host " |_____\__,_|_| |_| |_|_|_|___/" -ForegroundColor Blue
Write-Host ""
Write-Host "  Local Desktop Installer" -ForegroundColor White
Write-Host ""

# --- Check prerequisites ---

try {
    docker info 2>$null | Out-Null
} catch {
    Write-Host "Error: Docker is not installed or not running." -ForegroundColor Red
    Write-Host "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
    exit 1
}

try {
    docker compose version 2>$null | Out-Null
    $ComposeCmd = "docker compose"
} catch {
    Write-Host "Error: Docker Compose is not available." -ForegroundColor Red
    Write-Host "Docker Desktop includes Compose v2. Make sure it's enabled."
    exit 1
}

Write-Host "Docker is running." -ForegroundColor Green
Write-Host ""

# --- Create install directory ---

Write-Host "Installing to $LamdisDir"
New-Item -ItemType Directory -Path $LamdisDir -Force | Out-Null

$ComposeFilePath = Join-Path $LamdisDir $ComposeFile

# --- Download compose file ---

if (Test-Path $ComposeFilePath) {
    Write-Host "Existing installation found. Updating..." -ForegroundColor Yellow
}

try {
    Invoke-WebRequest -Uri $ComposeUrl -OutFile $ComposeFilePath -UseBasicParsing
} catch {
    # Fall back to local copy
    $ScriptDir = Split-Path -Parent $PSScriptRoot
    $LocalCopy = Join-Path $ScriptDir "docker-compose" $ComposeFile
    if (Test-Path $LocalCopy) {
        Copy-Item $LocalCopy $ComposeFilePath
    } else {
        Write-Host "Error: Could not download or find compose file." -ForegroundColor Red
        exit 1
    }
}

# --- Pull images ---

Write-Host ""
Write-Host "Pulling latest Lamdis images..." -ForegroundColor Blue
Write-Host "This may take a few minutes on first install."
Write-Host ""

Set-Location $LamdisDir
docker compose -f $ComposeFile pull

# --- Start services ---

Write-Host ""
Write-Host "Starting Lamdis..." -ForegroundColor Blue
docker compose -f $ComposeFile up -d

# --- Wait for health ---

Write-Host ""
Write-Host "Waiting for services to be ready..." -NoNewline

for ($i = 0; $i -lt 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 307) {
            break
        }
    } catch {}
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 2
}
Write-Host ""

# --- Done ---

Write-Host ""
Write-Host "Lamdis is running!" -ForegroundColor Green
Write-Host ""
Write-Host "  Dashboard:  http://localhost:3000" -ForegroundColor White
Write-Host "  API:        http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Host "  Data is stored in Docker volumes (survives restarts)."
Write-Host ""
Write-Host "  Commands:" -ForegroundColor Yellow
Write-Host "  Stop:       docker compose -f $ComposeFilePath down"
Write-Host "  Start:      docker compose -f $ComposeFilePath up -d"
Write-Host "  Logs:       docker compose -f $ComposeFilePath logs -f"
Write-Host "  Update:     docker compose -f $ComposeFilePath pull; docker compose -f $ComposeFilePath up -d"
Write-Host "  Uninstall:  docker compose -f $ComposeFilePath down -v; Remove-Item -Recurse $LamdisDir"
Write-Host ""
