# FoodResQ Dev Environment Startup
# Run this from the foodresq/ directory before starting the API

# 1. Start Redis (if not already running)
$redisRunning = Get-Process redis-server -ErrorAction SilentlyContinue
if ($redisRunning) {
  Write-Host "[Redis] Already running (PID $($redisRunning.Id))" -ForegroundColor Green
} else {
  Start-Process -FilePath "C:\redis\redis-server.exe" -ArgumentList "C:\redis\redis.windows.conf" -WindowStyle Hidden
  Start-Sleep -Seconds 1
  $pong = & "C:\redis\redis-cli.exe" ping 2>&1
  if ($pong -eq "PONG") {
    Write-Host "[Redis] Started on port 6379" -ForegroundColor Green
  } else {
    Write-Host "[Redis] Failed to start" -ForegroundColor Red
  }
}

# 2. Check PostgreSQL
$pg = Get-Service postgresql-x64-18 -ErrorAction SilentlyContinue
if ($pg -and $pg.Status -eq "Running") {
  Write-Host "[PostgreSQL] Running on port 5432" -ForegroundColor Green
} else {
  Write-Host "[PostgreSQL] Not running - start it with: Start-Service postgresql-x64-18" -ForegroundColor Yellow
}

Write-Host ""
Write-Host 'Ready. Start the API with:  pnpm --filter @foodresq/api dev' -ForegroundColor Cyan
Write-Host 'Start the web with:         pnpm --filter @foodresq/web dev' -ForegroundColor Cyan

