# -*- coding: utf-8 -*-
from pathlib import Path
import re

p = Path(r"f:/code/project/NX9/docs/shot-library-preview-prompts.md")
text = p.read_text(encoding="utf-8")
m = re.search(r"^## 4\. 全量镜头视频提示词", text, re.M)
if not m:
    raise SystemExit("section 4 not found")
rest = text[m.start():]
rest2 = re.sub(r"- 推荐基础图：`BASE-[A-F]`", "- 推荐基础图：`NX9-BASE`（唯一主图）", rest)

# Also simplify section 4 intro if present
rest2 = re.sub(
    r"^说明：.*$",
    "说明：全部条目共用同一张 `NX9-BASE`。每条 = `第 3 节通用前缀` + 下面代码块。",
    rest2,
    count=1,
    flags=re.M,
)

# Soften batch section later
rest2 = re.sub(
    r"^## 5\. 批次建议[\s\S]*?(?=^## 6\.)",
    """## 5. 批次建议

1. 先把 `NX9-BASE` 出到满意（宁可多抽几张，只留一张）。
2. 第一批：体系一物理运镜（推拉/摇移/横移/环绕/升降）——最能检验主图纵深。
3. 第二批：焦点 / 遮挡 / 风格化动态。
4. 第三批：无人机与特殊/玄幻条目（仍用同一张图；提示词负责「看起来像航拍/特效」，不要换底图）。

""",
    rest2,
    count=1,
    flags=re.M,
)

header = """# NX9 镜头库 · 预览视频生成提示词手册

> 用途：为公共镜头库 117 条内置运镜生成 **横画幅运动预览**（GIF/短视频）。
> 原则：**只用一张 NX9 签名基础图**；预览只说明机位怎么动，不换场景、不换脸。
> 数据源：`docs/nx9-shot-seeds-neutral.json`

---

## 0. 怎么用

1. 先生成下方 **唯一基础静帧** `NX9-BASE`（16:9 / 16:10）。
2. 全部运镜视频都用这同一张图做图生视频，只换各条运镜提示词。
3. 成片 6–10 秒，无字幕 / 无 UI / 无水印；可再压成循环 GIF。

---

## 1. 为什么只做这一张

镜头库预览要让人一眼认出「这是 NX9 的运镜词典」，不是通用博物馆样片。

这张图对齐 NX9 产品气质：

| NX9 产品 | 基础图落点 |
| --- | --- |
| 自研制片管线 / Studio | 电影摄影棚 · 可开拍的舞台空间 |
| 深色画布 `#0C0E12` | 炭黑舞台与暗部层次 |
| 品牌金 `#A67C4A` / `#C4A574` | 钨丝暖金 pragmatic 灯光与金属边缘 |
| 节点画布 / 流程感 | 地面淡淡点阵与透视导轨（像画布网格，不出现 UI 文字） |
| 运镜要看得懂 | 强纵深 + 中心可辨主体 + 四周留白够推拉环绕升降 |

**不要**：普通咖啡馆、赛博霓虹、古风教具静物、角色定妆海报脸。  
**只要**：一张「NX9 制片舞台」签名静帧，全库复用。

---

## 2. NX9-BASE · 唯一基础图提示词（直接复制）

### 中文

```
电影静帧，16:9 横构图，写实电影摄影，NX9 Studio 签名视觉。
一座当代暗色电影摄影棚 / 黑匣子舞台：炭黑地面与深灰墙体，强烈一点透视纵深通向远处柔光天幕。
地面有极淡的点阵与两条细暖金导轨线（像制片画布网格的物理隐喻），不要出现任何屏幕、Logo、字母或 UI。
画面中景一位匿名成年人物站在舞台中心偏前，深炭灰简约大衣，侧背光四分之三侧面，面容刻意不突出、无明星脸、无夸张妆造。
主光为钨丝暖金（接近古铜金 #A67C4A / #C4A574）从侧后方打出轮廓光与长地面高光；暗部保持干净层次，不要霓虹、不要赛博紫。
前景左侧可有一根深色立柱或旗板边缘，形成轻微遮挡层次，方便推拉与揭示类运镜。
构图冷静克制、制片感强：主体清晰、四周留白充足，适合推、拉、摇、移、升、降、环绕。
画面干净，无字幕、无水印、无台标。这是运镜教学示意底图，不是角色海报。
```

### English

```
Cinematic still, 16:9 landscape, photoreal film photography, NX9 Studio signature look.
A contemporary dark soundstage / black-box stage: charcoal floor, deep-gray walls, strong one-point perspective leading to a soft cyc wall in the distance.
Very faint dot-grid and two thin warm-brass guide lines on the floor (physical metaphor of a production canvas). No screens, logos, letters, or UI.
An anonymous adult stands mid-frame center-forward in a charcoal coat, three-quarter back/side view, face non-distinctive, no celebrity look, no fashion-poster styling.
Key light is warm tungsten/brass rim light (near bronze-gold #A67C4A / #C4A574) from rear-side, long soft floor highlights; clean shadows, no neon, no cyberpunk purple.
Optional dark pillar or flag edge in left foreground for mild occlusion depth.
Calm production craft aesthetic: clear subject, generous negative space for dolly, pan, truck, crane and orbit.
Clean frame, no subtitles, no watermark. Teaching base for camera moves, not a character poster.
```

### 出图时建议加的反向约束

```
no text, no watermark, no logo, no UI, no neon, no cyberpunk, no purple glow,
no celebrity face, no close-up beauty portrait, no cluttered set dressing,
no cartoon, no anime poster composition
```

### 选用这张图时的自检

- [ ] 3 秒内能感到「制片棚 / 可开拍」，而不是生活场景
- [ ] 暖金轮廓光明显，暗部是炭黑而不是脏灰
- [ ] 纵深一眼能看穿（远处天幕 / 墙面仍可见）
- [ ] 人物不是主角海报，只是尺度锚点
- [ ] 没有可读文字 / Logo

---

## 3. 图生视频通用前缀（每条运镜都加在最前）

### 中文

```
严格锁定这张 NX9 签名参考图的人物、服装、摄影棚场景与暖金光线，不要换脸、不要换场景、不要改成户外或赛博风。
只表现摄影机运动；主体尽量静止或仅有极轻微呼吸感（除非该条明确要求人物走动）。
电影摄影，平滑稳定（手持条目除外），无字幕、无水印、无 UI。
```

### English

```
Lock this NX9 signature reference: same person, wardrobe, soundstage and warm-brass lighting. Do not change face, location, or restyle to outdoors/cyberpunk.
Camera motion only; keep the subject nearly still unless the shot prompt requires walking.
Cinematic and smooth (except handheld entries). No subtitles, watermark, or UI.
```

---

"""

p.write_text(header + rest2, encoding="utf-8")
final = p.read_text(encoding="utf-8")
print("bytes", p.stat().st_size)
print("old BASE left", len(re.findall(r"BASE-[A-F]", final)))
print("NX9-BASE count", final.count("NX9-BASE"))
