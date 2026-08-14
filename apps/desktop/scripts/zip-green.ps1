# NX9 绿色解压版打包脚本
# 把 release/win-unpacked（electron-builder --dir 产物）压缩为 NX9-Studio-Green-<version>.zip
# 用法: powershell -ExecutionPolicy Bypass -File scripts/zip-green.ps1 [version]
$ErrorActionPreference = 'Stop'

$root   = Split-Path -Parent $PSScriptRoot
$version = if ($args[0]) { $args[0] } else { '0.1.0' }
$unpacked = Join-Path $root 'release\win-unpacked'
$outZip   = Join-Path $root "release\NX9-Studio-Green-$version.zip"

if (-not (Test-Path (Join-Path $unpacked 'NX9 Studio.exe'))) {
  throw "未找到 $unpacked\NX9 Studio.exe，请先执行 pnpm desktop:stage && pnpm desktop:pack:dir"
}

$sevenZip = Get-ChildItem (Join-Path $root '..\..\.electron-builder-cache') -Recurse -Filter '7za.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $sevenZip) { throw '未找到 7za.exe（.electron-builder-cache）' }

if (Test-Path $outZip) { Remove-Item $outZip -Force }
"压缩中 → $outZip ..."
& $sevenZip.FullName a -tzip $outZip "$unpacked\*" -mx=5 -mmt=on -bd
if ($LASTEXITCODE -ne 0) { throw "7za 失败 exit=$LASTEXITCODE" }
"完成: $outZip ($([math]::Round((Get-Item $outZip).Length/1MB,1)) MB)"
