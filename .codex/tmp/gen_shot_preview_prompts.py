# -*- coding: utf-8 -*-
"""Regenerate docs/shot-library-preview-prompts.md from nx9-shot-seeds-neutral.json.

Rules:
- Base still = user's 斜眼小蓝（蜜蜂版）
- Per-shot video prompts = verbatim promptZh / promptEn from seeds (do not rewrite)
"""
from __future__ import annotations

import json
from itertools import groupby
from pathlib import Path

ROOT = Path(r"f:/code/project/NX9")
SEEDS_PATH = ROOT / "docs" / "nx9-shot-seeds-neutral.json"
OUT_PATH = ROOT / "docs" / "shot-library-preview-prompts.md"

data = json.loads(SEEDS_PATH.read_text(encoding="utf-8"))
seeds = data["seeds"]

lines: list[str] = []
A = lines.append

A("# NX9 镜头库 · 预览视频生成提示词手册")
A("")
A("> 用途：为公共镜头库 117 条内置运镜生成 **横画幅运动预览**（GIF/短视频）。")
A("> 基础图：你提供的 **斜眼小蓝（蜜蜂版）** 机位参考图。")
A("> 运镜正文：**原样引用** `docs/nx9-shot-seeds-neutral.json` 的 `promptZh` / `promptEn`，不改写项目真实运镜提示词。")
A("")
A("---")
A("")
A("## 0. 怎么用")
A("")
A("1. 用下方约定的 **基础静帧**（建议从参考图里裁出 `01 正面中景` 或 `11 全身远景`，16:9）。")
A("2. 图生视频时：上传同一张基础静帧。")
A("3. 提示词 = **第 3 节锁定前缀** + **该条目的项目运镜提示词**（第 4 节，与种子文件一字不差）。")
A("4. 成片建议 6–10 秒（以条目 `durationSec` 为准），无字幕 / 无 UI / 无水印；可再压成循环 GIF。")
A("")
A("---")
A("")
A("## 1. 基础图说明（已定稿）")
A("")
A("| 项 | 内容 |")
A("| --- | --- |")
A("| 角色 | **斜眼小蓝（蜜蜂版）** |")
A("| 风格 | 毛绒可爱 · 治愈系 · 圆润软萌 · 斜眼撇人 |")
A("| 造型 | 短圆蓝色毛绒身体，半眯斜眼，小红嘴；黄黑条纹蜜蜂装 + 触角兜帽；背小白翅；斜挎棕色 `HONEY` 蜜罐 |")
A("| 环境 | 浅灰 / 白棚影棚，柔光，干净留白；底部可有白色圆形站台 |")
A("| 画幅 | 16:9 · MP4 / JPG |")
A("| 用途 | 镜头库缩略预览、运镜视频预览、分镜参考 |")
A("")
A("### 参考图里的 11 个机位（裁帧用）")
A("")
A("你的基础参考图已包含常用机位；**做运镜视频时只选其中一张静帧当图生视频起点**，不要把整张拼图直接喂给模型。")
A("")
A("| 编号 | 机位 | 建议用途 |")
A("| --- | --- | --- |")
A("| 01 | 正面（中景） | **默认主图**，覆盖绝大多数推/拉/摇/移/环绕 |")
A("| 02 | 45度角（中景） | 侧跟、环绕起始 |")
A("| 03 | 侧面（中景） | 侧移、过肩类辅助 |")
A("| 04 | 背面（中景） | 跟随、背影揭示 |")
A("| 05 | 低角度（仰拍） | 仰拍 / 升起类 |")
A("| 06 | 高角度（俯拍） | 俯拍 / 下降类 |")
A("| 07 | 大特写（表情） | 焦点 / 微距 / 表情冲击 |")
A("| 08 | 半身特写（表情+配饰） | 半身推进、变焦 |")
A("| 09 | 手部特写（配饰细节） | 蜜罐 / 细节揭示 |")
A("| 10 | 半身近景（服装细节） | 服装纹理、近景推拉 |")
A("| 11 | 全身远景（环境参考） | 航拍感、大全景起始、升降 |")
A("")
A("**推荐默认：** 先用 `01 正面（中景）` 统一生成全库；个别条目效果差再换 `05/06/07/11`。")
A("")
A("---")
A("")
A("## 2. 图生视频锁定前缀（可加在运镜正文前）")
A("")
A("> 这一段只负责「锁住斜眼小蓝」，**不替代**下面的项目运镜提示词。")
A("")
A("### 中文")
A("")
A("```")
A("严格锁定参考图中的角色「斜眼小蓝（蜜蜂版）」：蓝色毛绒身体、半眯斜眼、黄黑条纹蜜蜂装、触角兜帽、小白翅、棕色 HONEY 蜜罐；不要换角色、不要换服装、不要换影棚浅灰背景。")
A("只表现摄影机运动；角色尽量静止或仅有极轻微呼吸/眨眼（除非该条运镜明确要求走动）。")
A("毛绒可爱治愈风，柔光干净，无字幕、无水印、无 UI、无额外文字。")
A("```")
A("")
A("### English")
A("")
A("```")
A("Lock the reference character \"Squinty Little Blue (Bee Ver.)\": blue plush body, half-closed squinting eyes, yellow-black bee suit, antenna hood, tiny white wings, brown HONEY pot. Do not change character, costume, or clean light-gray studio backdrop.")
A("Camera motion only; keep the character nearly still except tiny breath/blink unless the shot requires walking.")
A("Plush cute healing look, soft clean light. No subtitles, watermark, UI, or extra text.")
A("```")
A("")
A("---")
A("")
A("## 3. 重要约定")
A("")
A("- 下方每条的 **项目运镜提示词** = 种子文件字段 `promptZh` / `promptEn` 的**原文**。")
A("- 不要把人物/场景细节改写进运镜正文；主体已由基础图注入。")
A("- 若图生视频工具需要更短文案，可临时改用同条目的 `logicZh` / `logicEn`（运动逻辑），但仍以 `promptZh` / `promptEn` 为项目标准。")
A("")
A("---")
A("")
A("## 4. 全量镜头视频提示词（117）")
A("")
A("说明：全部条目共用同一张斜眼小蓝基础静帧。每条复制时 = `第 2 节锁定前缀` + 下方 **项目运镜提示词**。")
A("")

idx = 0
for system, sys_group in groupby(seeds, key=lambda s: s["system"]):
    A(f"## {system}")
    A("")
    for category, cat_group in groupby(sys_group, key=lambda s: s["category"]):
        A(f"### {category}")
        A("")
        for s in cat_group:
            idx += 1
            label = s["label"]
            label_en = s["labelEn"]
            A(f"#### {idx}. {label} / {label_en}")
            A("")
            A(
                f"- ID：`{s['id']}` · 运镜族：`{s['moveFamily']}` · "
                f"{s['cameraMove']} · {s['shotSize']} · {s['durationSec']}s"
            )
            A(f"- 基础图：斜眼小蓝（蜜蜂版）· 建议静帧 `01 正面中景`")
            A(f"- 用途：{s['purposeZh']}")
            A("")
            A("**项目运镜提示词 ZH**（`promptZh` 原文）")
            A("")
            A("```")
            A(s["promptZh"])
            A("```")
            A("")
            A("**项目运镜提示词 EN**（`promptEn` 原文）")
            A("")
            A("```")
            A(s["promptEn"])
            A("```")
            A("")

A("---")
A("")
A("## 5. 批量建议")
A("")
A("1. 先用 `01 正面中景` 跑完体系一基础类（推拉 / 摇 / 移 / 环绕 / 升降）。")
A("2. 焦点 / 微距类可改用 `07` 或 `09`。")
A("3. 仰俯 / 航拍感可改用 `05` / `06` / `11`。")
A("4. 体系二特效类仍锁同一角色，让运镜差异更明显。")
A("5. 验收标准：同一角色一眼可认；不同条目的机位运动路径可区分。")
A("")
A(f"— 共 {len(seeds)} 条，与 `nx9-shot-seeds-neutral.json` 同步生成。")
A("")

OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
print(f"wrote {OUT_PATH} ({idx} shots, {OUT_PATH.stat().st_size} bytes)")
