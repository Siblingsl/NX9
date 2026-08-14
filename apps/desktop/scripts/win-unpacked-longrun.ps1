# NX9 win-unpacked 长跑测试（非沙箱 WMI 启动，等同用户双击）
$ErrorActionPreference = 'SilentlyContinue'
$exe = 'F:\code\project\NX9\apps\desktop\release\win-unpacked\NX9 Studio.exe'
$log = 'C:\Users\User\Desktop\nx9-electron.log'

Get-Process | Where-Object { $_.ProcessName -match '^NX9' } | Stop-Process -Force
Remove-Item $log -Force
Start-Sleep 2

"=== win-unpacked 长跑测试开始 $(Get-Date -Format 'HH:mm:ss') ==="
$cmd = "`"$exe`" --enable-logging=file --log-file=`"$log`""
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
"WMI Create returnValue=$($r.ReturnValue) pid=$($r.ProcessId) cmd=$cmd"

$deadline = (Get-Date).AddSeconds(240)
$appSeen = $false
$lastLogTail = 0
while ((Get-Date) -lt $deadline) {
  $apps = @(Get-Process | Where-Object { $_.ProcessName -match '^NX9' })
  $win  = ($apps | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { "$($_.Id):$($_.MainWindowTitle)" }) -join ','
  if (-not $win) { $win = '-' }
  $ports = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object -ExpandProperty LocalPort | Sort-Object) -join ','
  $logSize = if (Test-Path $log) { (Get-Item $log).Length } else { -1 }

  # 服务端日志（稳定路径 win-unpacked\nx9-data\nx9-server.log）
  $srvLog = 'F:\code\project\NX9\apps\desktop\release\win-unpacked\nx9-data\nx9-server.log'
  $srvTail = ''
  if (Test-Path $srvLog) {
    $lines = Get-Content $srvLog -Tail 3
    if ($lines.Count -gt 0) { $srvTail = ($lines -join ' / ') }
  }

  if ($apps.Count -gt 0 -and -not $appSeen) { $appSeen = $true; "!! 应用进程出现 @ $(Get-Date -Format 'HH:mm:ss')" }
  if ($appSeen -and $apps.Count -eq 0) { "!! 应用进程全部消失 @ $(Get-Date -Format 'HH:mm:ss')"; $appSeen = $false }

  "{0} procs={1} win=[{2}] ports=[{3}] log={4}B{5}" -f (Get-Date -Format 'HH:mm:ss'), $apps.Count, $win, $ports, $logSize, $(if($srvTail){' srv=['+$srvTail+']'}else{''})

  if ($appSeen -and $logSize -gt $lastLogTail) {
    $tail = Get-Content $log -Tail 6
    if ($tail) { $tail | ForEach-Object { "   LOG $_" } }
    $lastLogTail = $logSize
  }
  Start-Sleep -Seconds 2
}
"=== 结束 $(Get-Date -Format 'HH:mm:ss') ==="
$remain = @(Get-Process | Where-Object { $_.ProcessName -match '^NX9' })
"剩余: $($remain.Count) ($(($remain | ForEach-Object { $_.ProcessName + ':' + $_.Id }) -join ', '))"
