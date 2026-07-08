$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:NX9_ROOT = (Resolve-Path "..\..").Path
$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
& $py server.py
