# Lamdis Development Services Manager for Windows PowerShell
# Usage: .\dev.ps1 [start|stop|status|help]

param(
    [Parameter(Position=0)]
    [string]$Command = "menu",
    [Parameter(Position=1)]
    [string]$Service = ""
)

$ScriptDir = $PSScriptRoot
$LogDir = Join-Path $ScriptDir ".logs"
$PidDir = Join-Path $ScriptDir ".pids"

# Service definitions: name -> @{dir, port}
$Services = @{
    "lamdis-api"     = @{ dir = "lamdis-api"; port = 3001 }
    "lamdis-runs"    = @{ dir = "lamdis-runs"; port = 3101 }
    "lamdis-web"     = @{ dir = "lamdis-web"; port = 3000 }
}

# Create directories
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
if (-not (Test-Path $PidDir)) { New-Item -ItemType Directory -Path $PidDir -Force | Out-Null }

function Get-PidByPort {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection) {
        return $connection.OwningProcess
    }
    return $null
}

function Stop-ProcessOnPort {
    param([int]$Port)
    $processId = Get-PidByPort -Port $Port
    if ($processId) {
        Write-Host "Stopping process $processId on port $Port..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

function Test-PortInUse {
    param([int]$Port)
    $processId = Get-PidByPort -Port $Port
    return $null -ne $processId
}

function Start-LamdisService {
    param(
        [string]$Name,
        [string]$Dir,
        [int]$Port
    )
    
    Write-Host "Starting $Name on port $Port..." -ForegroundColor Blue
    
    if (Test-PortInUse -Port $Port) {
        Write-Host "Port $Port in use, stopping existing process..." -ForegroundColor Yellow
        Stop-ProcessOnPort -Port $Port
        Start-Sleep -Seconds 2
    }
    
    $logFile = Join-Path $LogDir "$Name.log"
    $serviceDir = Join-Path $ScriptDir $Dir
    
    # Clear old log
    "" | Out-File -FilePath $logFile -Force
    
    # Start the service in a new window
    $argList = "/c cd /d `"$serviceDir`" && npm run dev > `"$logFile`" 2>&1"
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList $argList -WindowStyle Hidden -PassThru
    
    Start-Sleep -Seconds 3
    
    if (Test-PortInUse -Port $Port) {
        Write-Host "[OK] $Name started on port $Port" -ForegroundColor Green
    } else {
        Write-Host "[?] $Name starting... check logs if issues" -ForegroundColor Yellow
    }
}

function Stop-LamdisService {
    param(
        [string]$Name,
        [int]$Port
    )
    
    Write-Host "Stopping $Name on port $Port..." -ForegroundColor Yellow
    Stop-ProcessOnPort -Port $Port
    Write-Host "[OK] $Name stopped" -ForegroundColor Green
}

function Show-Status {
    Write-Host ""
    Write-Host "=== Service Status ===" -ForegroundColor Cyan
    Write-Host ""
    
    foreach ($key in $Services.Keys) {
        $svc = $Services[$key]
        $port = $svc.port
        $processId = Get-PidByPort -Port $port
        
        if ($processId) {
            Write-Host "[RUNNING] $key (port $port) - PID: $processId" -ForegroundColor Green
        } else {
            Write-Host "[STOPPED] $key (port $port)" -ForegroundColor Red
        }
    }
    Write-Host ""
}

function Start-AllServices {
    Write-Host ""
    Write-Host "=== Starting All Services ===" -ForegroundColor Cyan
    Write-Host ""
    
    foreach ($key in $Services.Keys) {
        $svc = $Services[$key]
        Start-LamdisService -Name $key -Dir $svc.dir -Port $svc.port
    }
    
    Write-Host ""
    Write-Host "All services started!" -ForegroundColor Green
    Write-Host "Logs are in: $LogDir" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Use .\dev.ps1 logs to view logs"
    Write-Host "Use .\dev.ps1 status to check status"
}

function Stop-AllServices {
    Write-Host ""
    Write-Host "=== Stopping All Services ===" -ForegroundColor Cyan
    Write-Host ""
    
    foreach ($key in $Services.Keys) {
        $svc = $Services[$key]
        Stop-LamdisService -Name $key -Port $svc.port
    }
    
    Write-Host ""
    Write-Host "All services stopped!" -ForegroundColor Green
}

function Show-Logs {
    param([string]$ServiceName = "")
    
    if ($ServiceName -eq "") {
        Write-Host "Available log files:" -ForegroundColor Cyan
        Get-ChildItem -Path $LogDir -Filter "*.log" -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host "  - $($_.Name)" -ForegroundColor Yellow
        }
        Write-Host ""
        Write-Host "Use: .\dev.ps1 logs SERVICE_NAME" -ForegroundColor Gray
        Write-Host "Example: .\dev.ps1 logs lamdis-api" -ForegroundColor Gray
    } else {
        # Map short names
        switch ($ServiceName) {
            "api" { $ServiceName = "lamdis-api" }
            "runs" { $ServiceName = "lamdis-runs" }
            "web" { $ServiceName = "lamdis-web" }
        }
        
        $logFile = Join-Path $LogDir "$ServiceName.log"
        if (Test-Path $logFile) {
            Write-Host "=== Tailing $ServiceName logs (Ctrl+C to stop) ===" -ForegroundColor Cyan
            Get-Content -Path $logFile -Tail 50 -Wait
        } else {
            Write-Host "Log file not found: $logFile" -ForegroundColor Red
        }
    }
}

function Show-Menu {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "     Lamdis Development Manager        " -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    Show-Status
    
    Write-Host "Commands:" -ForegroundColor Cyan
    Write-Host "  [1] Start all services"
    Write-Host "  [2] Stop all services"
    Write-Host "  [3] Restart all services"
    Write-Host "  [4] View logs"
    Write-Host "  [5] Refresh status"
    Write-Host "  [q] Quit"
    Write-Host ""
    
    $choice = Read-Host "Select option"
    
    switch ($choice) {
        "1" { Start-AllServices; Show-Menu }
        "2" { Stop-AllServices; Show-Menu }
        "3" { Stop-AllServices; Start-Sleep -Seconds 2; Start-AllServices; Show-Menu }
        "4" { Show-Logs; Show-Menu }
        "5" { Show-Menu }
        "q" { Write-Host "Bye!" -ForegroundColor Green; exit }
        "Q" { Write-Host "Bye!" -ForegroundColor Green; exit }
        default { Write-Host "Invalid option" -ForegroundColor Red; Show-Menu }
    }
}

function Show-Help {
    Write-Host "Lamdis Development Manager" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\dev.ps1 [command]"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  start     Start all services"
    Write-Host "  stop      Stop all services"
    Write-Host "  restart   Restart all services"
    Write-Host "  status    Show service status"
    Write-Host "  logs      List available logs"
    Write-Host "  logs NAME Tail specific service (api, runs, web, lamdis-api, etc.)"
    Write-Host "  menu      Interactive menu (default)"
    Write-Host "  help      Show this help"
    Write-Host ""
}

# Main entry point
switch ($Command.ToLower()) {
    "start" { Start-AllServices }
    "stop" { Stop-AllServices }
    "restart" { Stop-AllServices; Start-Sleep -Seconds 2; Start-AllServices }
    "status" { Show-Status }
    "logs" { Show-Logs -ServiceName $Service }
    "menu" { Show-Menu }
    "help" { Show-Help }
    default { Show-Help }
}
