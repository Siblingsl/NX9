# Install LuxTTS sidecar dependencies (Windows)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Creating venv..."
python -m venv .venv
& .\.venv\Scripts\Activate.ps1

Write-Host "Installing Python packages..."
pip install --upgrade pip
pip install -r requirements.txt
pip install "git+https://github.com/ysharma3501/LuxTTS.git"

Write-Host ""
Write-Host "Done. Start with: npm run luxtts:start"
Write-Host "Or: .\.venv\Scripts\python.exe server.py"
