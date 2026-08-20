# 求职工作台常驻启动脚本（生产模式，端口 3000）
# 特性：幂等（已在运行则退出）、崩溃自动重启、等待数据库就绪
$ErrorActionPreference = 'Stop'

$WebDir   = $PSScriptRoot
$Port     = 3000
$LockFile = Join-Path $WebDir 'server-watchdog.pid'
$OutLog   = Join-Path $WebDir 'server-production.out.log'
$ErrLog   = Join-Path $WebDir 'server-production.err.log'

$env:PORT = '3000'
$env:HOST = '127.0.0.1'

function Test-PortListening([int]$port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

# 幂等：同一守护进程已在运行则退出
if (Test-Path $LockFile) {
  try {
    $existingPid = [int](Get-Content -LiteralPath $LockFile -ErrorAction Stop)
    if ($existingPid -gt 0 -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
      Write-Output ('watchdog already running (pid ' + $existingPid + '), exit')
      exit 0
    }
  }
  catch { }
}
[System.IO.File]::WriteAllText($LockFile, [string]$PID)

# 幂等：端口已被占用（dev 或 prod 均算）则退出，避免双实例
if (Test-PortListening $Port) {
  Write-Output ('port ' + $Port + ' already in use, exit')
  exit 0
}

# 等待数据库就绪（Docker Desktop 启动较慢，最多等 120 秒）
$deadline = (Get-Date).AddSeconds(120)
while (-not (Test-PortListening 5432)) {
  if ((Get-Date) -gt $deadline) { break }
  Start-Sleep -Seconds 2
}

# 守护循环：进程退出后自动重启
while ($true) {
  if (-not (Test-PortListening $Port)) {
    $process = Start-Process -FilePath 'node.exe' `
      -ArgumentList '--env-file=.env', '.output/server/index.mjs' `
      -WorkingDirectory $WebDir -WindowStyle Hidden `
      -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -PassThru
    Write-Output ('started node pid ' + $process.Id)
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
    Write-Output 'node exited, restart in 3s'
    Start-Sleep -Seconds 3
  }
  else {
    Start-Sleep -Seconds 5
  }
}