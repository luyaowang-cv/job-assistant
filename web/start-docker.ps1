# 登录时确保 Docker Desktop 已启动（数据库依赖它）
$DockerDesktop = 'C:\Users\Administrator\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe'
if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
  if (Test-Path $DockerDesktop) {
    Start-Process $DockerDesktop
    Write-Output 'Docker Desktop started'
  }
}