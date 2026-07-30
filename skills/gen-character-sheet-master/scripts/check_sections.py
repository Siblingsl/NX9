#!/usr/bin/env python3
"""Local structural check for gen-character-sheet-master."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "这个 skill 用来做什么", "输入要求", "输出要求",
    "工作流程", "约束与边界", "示例", "检查清单",
]
text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
missing = [s for s in REQUIRED if s not in text]
assert not missing, f"missing sections: {missing}"
assert (ROOT / "metadata.json").exists()
assert (ROOT / "examples" / "input.md").exists()
assert (ROOT / "examples" / "output.md").exists()
print("ok: gen-character-sheet-master")
