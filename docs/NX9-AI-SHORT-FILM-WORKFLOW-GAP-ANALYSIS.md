# NX9 · AI 短片工作流缺口分析与补齐说明（2026-09-11）

> **目标**：在现有「AI 漫剧核心 6 步」之上，补齐一条可直接产出**有声短片**的完整工作流，并关闭主链上可代码收口的断环。  
> **范围**：剧本 → 分镜 → 导演关键帧 → 视频 → **配音/BGM** → 智能剪辑 → 导出。  
> **非范围**：供应商账号余额、真实云端额度冒烟（见 `REAL-PROVIDER-VALIDATION.md`）；口型同步（产品后置）。

---

## 1. 结论先行

> **2026-09-11 收口**：SF-01～10 与 SF-14～20 代码已齐。通道真机（SF-11）与口型（SF-12）、支线（SF-13）仍属文档边界。真机勾选清单见 `REAL-PROVIDER-VALIDATION.md` §F-034 / §F-035；`channel-demo-honesty` 禁止虚标 100%。

| 维度 | 现状（收口后） | 边界 |
|------|------|------|
| 入口工作流 | ✅ `pb-ai-short-film` + `tpl-ai-short-film`（cast+BGM+sfx，导出 remotion-episode） | — |
| 声音挂轨 | ✅ VO 写回、按镜对齐、TTS 实长、同镜顺序、同源字幕、音效轨 | — |
| BGM 语义 | ✅ 仅 `bgmUrls`（music 模式）进 BGM | — |
| 导出成片 | ✅ 默认多轨 Remotion；FFmpeg 仍可选粗拼 | — |
| 真实验证 | 单测绿 | SF-11 真机台账待通道 |
| 口型 / 支线 | — | SF-12 / SF-13 |

**一句话**：有声短片主链代码闭环已齐；真机冒烟与口型不在本轮代码门禁内。

---

## 2. 目标工作流（AI 短片 · 7 步）

```text
① 编剧台 → ② 分镜台（挂图像生成）→ ③ 导演台批出/审阅
→ ④ 视频生成 → ⑤ 声音（对白 TTS / 多角色 / BGM）
→ ⑥ 智能剪辑（含 VO+BGM 挂轨 + 建议确认）→ ⑦ 导出交付
```

与「AI 漫剧」差异：

| | AI 漫剧（既有） | AI 短片（新增） |
|--|----------------|----------------|
| 模板 | `tpl-core-episode` | `tpl-ai-short-film` |
| Playbook | `pb-ai-comic-*` | `pb-ai-short-film` |
| 步数 | 6 | **7**（插入声音步） |
| 声音 | 可选旁路 | **主链节点** `sound-gen` |
| 剪辑就绪 | `has_timeline_draft` | `has_timeline_confirmed`（有时间线且已确认） |

---

## 3. 缺口清单（按优先级）

### P0 · 阻断「有声短片」闭环

| ID | 缺口 | 证据 | 处置 |
|----|------|------|------|
| SF-01 | 无「AI 短片」Playbook/模板 | `playbook-definitions.ts` / `workflow-templates.ts` 无对应项 | 新增 `pb-ai-short-film` + `tpl-ai-short-film` |
| SF-02 | 核心成片图无 `sound-gen` | `tpl-core-episode` 仅 7 节点、无声音边 | 短片模板：分镜→声音→剪辑（sound 口） |
| SF-03 | 多角色配音不写 `voice.lines` | `VoiceCastBlock` 只写节点 `results`/`audioUrl` | 成功后同步 `addVoiceLines` / 更新已有行 |
| SF-04 | VO 轨全部 `startSec: 0` | `buildVoiceDramaTimeline` | 按视频轨同 `shotId` 片段对齐起止 |
| SF-05 | 漫剧编排不自动挂对白轨 | `orchestrateDramaTimeline` 仅 BGM | 编排后合并 `voice.lines` 注入（有则挂） |

### P1 · 门禁与引导

| ID | 缺口 | 证据 | 处置 |
|----|------|------|------|
| SF-06 | 缺 `has_sound_assets` | readiness 无声音节点成功判据 | 新增：sound-gen success + audioUrl/sounds |
| SF-07 | 智能剪辑不认确认态 | F-050；`confirmedAt` 写在节点但 readiness 未读 | 新增 `has_timeline_confirmed`；短片/核心漫剧剪辑步改用 |
| SF-08 | `pb-voice-drama` 步骤残缺 | 仅 script + export | 补：对白→配音→剪辑→导出 |
| SF-09 | 对话抽取无 `shotId` | `DialogueLine` / `extractDialogueLinesFromBreakdown` | 扩展 `shotId?`，拆镜对白带镜号 |

### P2 · 体验与台账（不挡主链，文档保留）

| ID | 缺口 | 说明 |
|----|------|------|
| SF-10 | 图像生成压住分镜台 | 短片模板拉开行距/列位 |
| SF-11 | 通道欠费 / 真渲零产物 | 见生产就绪分析；需人工通道与一次真渲 |
| SF-12 | 口型同步 | 产品明确后置，不作本工作流门禁 |
| SF-13 | F-031/033/035/046/048/049 等 | 爆款/电商/高级配方支线，不纳入短片主链本轮强制范围 |

---

## 4. 验收标准（本轮代码必须满足）

1. 启动器可见 featured「AI 短片」；加载后画布含 script / storyboard / picture / director / clip-gen / **sound-gen** / clip-editor / export-pack。  
2. 声音节点可从上游分镜/编剧解析对白；批量配音成功后 `voice.lines` 含 `audioAssetId`（及可得的 `shotId`）。  
3. 智能剪辑漫剧编排后：有配音则出现对白音轨，且片段 `startSec` 对齐对应视频镜；有上游 BGM 则有 BGM 轨。  
4. Playbook：声音步 `has_sound_assets`；剪辑步 `has_timeline_confirmed`（需确认）；导出仍 `export_ready`。  
5. 单测覆盖：模板拓扑、readiness、VO 对齐、配音写回契约。

---

## 5. 与既有文档关系

- `NX9-PROJECT-DEFECT-ANALYSIS.md`：F-014（BGM）已收口；本轮补 F-034/F-050 在短片主链上的实码断环。  
- `NX9-PRODUCTION-READINESS-GAP-ANALYSIS-2026-09-04.md`：通道与真渲属 L1/L3，本轮不宣称「本机已真做出一部」。  
- `NX9-UX-COMPLEXITY-ANALYSIS-2026-08-31.md`：操作碎片化仍在；短片工作流提供更完整默认图，不替代全站 UX 收口。

---

## 6. 实施记录（随补齐更新）

| 日期 | 项 | 状态 |
|------|-----|------|
| 2026-09-11 | 本文档初稿 | ✅ |
| 2026-09-11 | SF-01 新增 `pb-ai-short-film` + `tpl-ai-short-film` | ✅ |
| 2026-09-11 | SF-02 短片模板挂 `sound-gen` 并连剪辑 sound 口 | ✅ |
| 2026-09-11 | SF-03 `VoiceCastBlock` 写回 `voice.lines` | ✅ |
| 2026-09-11 | SF-04 `buildVoiceDramaTimeline` 按镜对齐 VO | ✅ |
| 2026-09-11 | SF-05 漫剧编排后自动挂对白轨（台内 + 画布 run） | ✅ |
| 2026-09-11 | SF-06/07 `has_sound_assets` / `has_timeline_confirmed` | ✅ |
| 2026-09-11 | SF-08 声音剧 Playbook 补全 4 步 | ✅ |
| 2026-09-11 | SF-09 拆镜对白抽取带 `shotId` | ✅ |
| 2026-09-11 | SF-10 短片模板图像节点与分镜分行 | ✅ |
| 2026-09-11 | 验收测 `ai-short-film-workflow.test.ts` + F-007 更新 | ✅ |
| 2026-09-11 | SF-11～13 通道真渲/口型/支线 | 📄 文档保留，非本轮代码范围 |
| 2026-09-11 | 复审：增补 SF-14～20（导出/BGM 误挂/时长/音效等） | 📄 见 §7 |
| 2026-09-11 | SF-14 默认 `remotion-episode` 多轨成片 | ✅ |
| 2026-09-11 | SF-15 `bgmUrls` 分流，cast 不再当 BGM | ✅ |
| 2026-09-11 | SF-16 VoiceLine.durationSec + probe/估算 | ✅ |
| 2026-09-11 | SF-17 同镜多句顺序偏移 | ✅ |
| 2026-09-11 | SF-18 模板 cast+music+sfx 三声音节点 | ✅ |
| 2026-09-11 | SF-19 音效模式 + 音效轨挂入 | ✅ |
| 2026-09-11 | SF-20 对白同源字幕轨 | ✅ |
| 2026-09-11 | SF-11～13 通道真渲/口型/支线 | 📄 仍属文档边界 |

---

## 7. 复审缺口与收口状态（2026-09-11）

### P0 · 假成片 / 错轨 → 已收口

| ID | 缺口 | 状态 | 处置摘要 |
|----|------|------|----------|
| SF-14 | 默认导出丢多轨 | ✅ | 模板 `exportMode: remotion-episode`；`export-pack-runner` 新增该模式，吃时间线多轨 |
| SF-15 | cast 被当 BGM | ✅ | `gatherUpstream` 产出 `bgmUrls`（仅 music）；剪辑/`media-ops` 用 `bgmUrls[0]` |

### P1 · 成品质 → 已收口

| ID | 缺口 | 状态 | 处置摘要 |
|----|------|------|----------|
| SF-16 | VO 非 TTS 实长 | ✅ | `VoiceLine.durationSec`；TTS 后 probe + `estimateVoiceDurationSec` |
| SF-17 | 同镜多句叠放 | ✅ | `shotCursor` 同镜顺序累加 |
| SF-18 | 对白+BGM 难一次做 | ✅ | 模板三声音节点 cast / music / sfx |
| SF-19 | 无音效轨 | ✅ | `soundMode=sfx` + `sfxUrls` →「音效」轨 |

### P2 · 体验与验证

| ID | 缺口 | 状态 | 说明 |
|----|------|------|------|
| SF-20 | 对白同源字幕 | ✅ | `buildVoiceDramaTimeline` 默认从 voice.lines 生成字幕轨 |
| SF-11 | 真机产物台账 | 📄 | 通道/额度层，见 `REAL-PROVIDER-VALIDATION.md` |
| SF-12 | 口型同步 | 📄 | 产品后置 |
| SF-13 | 支线配方 | 📄 | 不纳入短片主链 |

**代码侧 SF-14～20 已全部收口**；SF-11～13 仍按原文档边界保留。
