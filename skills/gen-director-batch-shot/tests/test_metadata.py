#!/usr/bin/env python3
"""Metadata + layout tests for gen-director-batch-shot."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def test_metadata_name_matches_dir():
    meta = json.loads((ROOT / "metadata.json").read_text(encoding="utf-8"))
    assert meta["name"] == ROOT.name
    assert meta["entry"] == "SKILL.md"
    assert meta["status"] in ("draft", "stable", "deprecated")
    assert len(meta.get("description", "")) >= 20
    assert meta.get("nx9", {}).get("lane") == "builtin"

def test_layout_complete():
    for rel in [
        "SKILL.md", "metadata.json",
        "examples/input.md", "examples/output.md", "examples/bad-output.md",
        "references/domain-notes.md", "references/workflow-rules.md",
        "templates/output-schema.md",
        "scripts/check_sections.py", "tests/test_metadata.py",
    ]:
        assert (ROOT / rel).exists(), rel

if __name__ == "__main__":
    test_metadata_name_matches_dir()
    test_layout_complete()
    print("PASS gen-director-batch-shot")
