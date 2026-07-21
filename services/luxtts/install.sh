#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install "git+https://github.com/ysharma3501/LuxTTS.git"

echo "Done. Start with: pnpm run luxtts:start"
