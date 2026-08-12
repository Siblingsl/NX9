# NX9 智能剪辑台 · 未完成项 + 深度断点（2026-08-12）

> **落点**：`docs/8.12/NX9-SMART-EDIT-OPEN-LOOPS-DEEP-2026-08-12.md`  
> **范围**：`clip-editor` / EditDesk / 编排器 / Remotion·HF·FFmpeg 渲染 / SmartReplace / video-edit 全链  
> **依据**：`docs/NX9-SMART-EDIT-DESK-SPEC.md` 实现快照 + **当日代码复读**（不以「主闭环已落地」口号跳过细缝）  
> **原则**：字段在 / 按钮在 / P0–P3 标完成 ≠ 生产可验收闭环  
> **关联**：跨域假绿见同目录 `NX9-DEEP-OPEN-LOOPS-*.md`、`NX9-DEEP-REMAINING-GAPS-*.md`（本文不重复开票，仅索引）

---

## 0. 一句话结论

智能剪辑台 **P0–P1 时间轴 MVP、P2 替换主路径、P3 video-edit 提交轮询** 已能跑通「编排 → 剪 → 预览 → 替换 → 送交」。  
当前未完成与深挖断点集中在五类：

1. **预览 ≠ 成片仍有诚实裂缝**（FFmpeg 粗预览、爆款默认 HF vs Player 用 Remotion、wipe/shader 静默降级）  
2. **智能建议半诚实**（`ops` 生效，但 `template-patch` 仍把变量塞进废弃 `patch`，采纳等于空操作）  
3. **智能替换未闭环细项**（@素材只扩文案不附图；无 cancel；take 仅 candidate；无跨帧追踪）  
4. **video-edit 工程风险**（内存任务表、整段视频转 data URI、单供应商、无追踪）  
5. **时间轴打磨债**（音量包络不可视、无波形、overlay 无位姿、磁吸/波纹体验不完整）

**没有新的「完全打不开台」P0**；有多处 **P1 假提示 / P1–P2 生产风险**，不修会在下一轮验收被当成「智能剪辑还是半成品」。

---

## 1. 判定符号

| 符号 | 含义 |
|------|------|
| ❌ | 断点或状态撒谎，建议开票 |
| ⚠ | 半闭环 / 诚实不足 / 易误用 |
| 🏗 | 工程债（可维护性 / 崩溃面） |
| ⏸ | 产品明确后置，须记档防回潮 |
| ✅ | 本轮核实已闭环（勿再当缺口） |

优先级：P0 骗状态或必崩 → P1 主路径缺口 → P2 打磨 → P3 增强。

---

## 2. 本轮核实：已闭环（勿再开票）

| ID | 结论 | 锚点 |
|----|------|------|
| SE-BASE-01 | 时间轴 v3 + `TimelineOp` + 撤销栈 | `timeline-ops.ts` / `use-timeline-editor.ts` |
| SE-BASE-02 | `@remotion/player` + `Nx9Episode` 预览 | `PreviewPlayer.tsx` |
| SE-BASE-03 | 拖移 / 裁剪 / 分割 / 删除 / 磁吸 / 静音锁定 | `TimelinePanel.tsx` |
| SE-BASE-04 | probe 校准编排时长 | `calibrateTimeline` in `smart-edit-orchestrator.ts` |
| SE-BASE-05 | 服务端 `render-remotion` 接通 | `clip-editor-render.ts` |
| SE-BASE-06 | 建议采纳走 `ops`（trim/transition/ducking） | `EditDesk.acceptSuggestion` |
| SE-BASE-07 | SmartReplace 帧编辑 + 图生视频 + 对比采纳 | `SmartReplacePanel.tsx` |
| SE-BASE-08 | `@角色/@场景` 输入组件已挂 | `AssetMentionInput` in SmartReplace |
| SE-BASE-09 | 采纳写回 `videoVersions` + clip.`takeId` | `ClipEditorBlock.handleWritebackShotVersion` |
| SE-BASE-10 | `POST /api/montage/video-edit` + 面板「直接替换」 | `video-edit.service.ts` |
| SE-01～04 | 画布/粗预览文案/建议冲突/legacy（他档已销） | 见 `DEEP-REMAINING-GAPS` §7 |

---

## 3. 规格仍开放（相对 SMART-EDIT-DESK-SPEC §5–§6）

| ID | 优先级 | 项 | 现状 | 收口标准 |
|----|--------|----|------|----------|
| SE-SPEC-01 | P2 | `POST /api/picture/edit-masked` | 走 `proxyFal` / `proxyImage`，无专用契约与测例 | 独立路由：mask + prompt + 引擎；失败码稳定；验收测例 |
| SE-SPEC-02 | P1 | P3 首帧标注 → **跨帧自动追踪** | 仅首帧笔刷 mask 整段喂 wan-vace；无 SAM/跟踪 | 运动镜头人物整段替换边缘不闪；可取消可轮询 |
| SE-SPEC-03 | P2 | 音频波形 | 轨上纯色块 | peaks API 或 WebAudio；至少对白/BGM 轨可见 |
| SE-SPEC-04 | P2 | Overlay 位姿编辑 | 类型有 overlay；合成 `objectFit:contain` 全幅；**无 x/y/scale UI** | 检查器改位置/缩放，预览与 Remotion 一致 |
| SE-SPEC-05 | P3 | 路线 B 多供应商 | 仅 `wan-vace` | 注册表 ≥2；面板可选；失败可换供应商 |

---

## 4. 深度断点（当日代码复读 · 新开票）

### 4.1 ❌ SE-DEEP-01 · P1 · `template-patch` 建议采纳空操作

**锚点**：`smart-edit-orchestrator.ts` ≈L347–355；`EditDesk.acceptSuggestion` ≈L191–199  

爆款编排注入：

```ts
kind: 'template-patch',
patch: { templateVars: hfVars },
ops: [],   // ← 空
confidence: 0.8,
```

采纳逻辑**只执行 `ops`**，`patch` 已 `@deprecated`。用户点「采纳」日志写「提示型，无时间线变更」，**HF 模板变量从未写入节点 `data`**。  
同文件漫剧侧转场/trim 已有真 `ops`——唯独这条仍是「表演型建议」。

**收口**：要么 `ops`/`onAccept` 写 `updateNodeData({ templateVars })`，要么降为 `confidence` 提示且文案写清「已在编排时注入，无需采纳」并默认不进待确认列表。

---

### 4.2 ⚠ SE-DEEP-02 · P1 · 预览引擎与导出引擎不一致（爆款 / HF）

**锚点**：  
- `resolveEngine`：`viral + auto` → `hyperframes`  
- `PreviewPlayer`：**永远**挂 `Nx9Episode`（Remotion）  
- `renderClipEditorTimeline`：HF 走服务端模板队列  

用户在爆款+自动下：台内所见 = Remotion 合成；点「预览渲染」= HyperFrames。转场/字幕/音量包络在两边语义未必对齐 → **「预览=成片」口号在 HF 路径不成立**。

**收口**：爆款默认改 Remotion；或 HF 模式预览改「上次 HF 成片 / 占位警告条强制」；禁止静默双引擎。

---

### 4.3 ⚠ SE-DEEP-03 · P1 · wipe / shader 转场静默降级为 fade

**锚点**：`packages/remotion-compositions/src/clips/VideoClip.tsx` L12、L28–31  

类型与检查器可选 `wipe` / `shader`，渲染侧一律当 opacity fade。检查器未标「仅 fade 生效」。

**收口**：UI 禁用未实现 kind，或实现 wipe；至少 Inspector 旁注「预览/成片目前仅 fade」。

---

### 4.4 ⚠ SE-DEEP-04 · P1 · @素材库只扩 Prompt 文案，不附图

**锚点**：`SmartReplacePanel.runImageEdit` → `api.proxyImage({ referenceImageUrl: frameUrl })`  

`enrichPromptWithAssetMentions` 把 `@场景:天台` 展开成文字锁定描述，**角色/场景参考图 URL 未进入** `referenceImageUrl` / 多图数组。  
规格验收「@场景:天台 → 重生成」在视觉一致性上仍弱——模型只见字不见图。

**收口**：解析 mention → 收集库条目主图；`proxyImage` / fal inpaint 附带 reference 列表（与 picture-gen mentionRefs 同协议）。

---

### 4.5 ⚠ SE-DEEP-05 · P1 · 替换写回 take 仅为 `candidate`，导演台未自动 adopt

**锚点**：`ClipEditorBlock.handleWritebackShotVersion` → `appendStoryboardVideoVersion(..., status: 'candidate')`  

时间线已换新 URL，但上游镜 `videoStatus: 'review'`，需导演台再 adopt。剪辑台内无「采用为镜头正式版」开关；易出现「成片已换、导演审片仍旧版」。

**收口**：采纳对话框二选一「仅时间线 / 时间线+采用正式版」；或采用后 `adoptStoryboardVideoVersion`。

---

### 4.6 ❌ SE-DEEP-06 · P1 · 智能替换 / video-edit **不可取消**

**锚点**：`SmartReplacePanel` 无 `AbortController`；`VideoEditService` 无 cancel API；面板关闭不中止轮询  

长任务（图生视频 / 15–20min video-edit）关面板后请求仍跑；无法停 Fal 队列。

**收口**：面板 `signal` 中止轮询；服务端 `DELETE/POST .../cancel`；Fal cancel 若不可用至少停本地 job 标记。

---

### 4.7 🏗 SE-DEEP-07 · P1 · video-edit 任务仅内存 Map，进程重启即丢

**锚点**：`video-edit.service.ts` `private readonly jobs = new Map(...)`  

与 montage 其它可落盘任务不一致。刷新服务后前端继续 poll → 永远找不到 taskId。

**收口**：落盘 `storage/tasks` 或复用现有 task store（对照 remotion/hyperframes 任务持久化）。

---

### 4.8 🏗 SE-DEEP-08 · P0/P1 · 本地 `/media` 视频整段转 data URI 喂 Fal

**锚点**：`video-edit.service.ts` `toRemoteInput`  

对本地成片 `fs.readFileSync` → base64 data URI。长镜头 / 高码率 **必炸内存或超 Fal body 限制**。

**收口**：先上传到可公网拉取的临时 URL（对象存储 / fal storage），禁止整片 base64。

---

### 4.9 ⚠ SE-DEEP-09 · P2 · FFmpeg「粗预览」仍可选为导出引擎

**锚点**：`clip-editor-render.ts` L66–75；`EditDesk` 引擎下拉含 `ffmpeg`  

文案已警告，但用户仍可把 FFmpeg 当「预览渲染」产物同步到交付打包 → **交付包不含裁剪/转场/音轨**。诚实文案 ≠ 防呆。

**收口**：FFmpeg 仅标「诊断拼接」且禁止「确认并送交」；或送交前强制 Remotion/HF。

---

### 4.10 ⚠ SE-DEEP-10 · P2 · 音量关键帧无时间轴可视（与 DR-06 同根，剪辑台侧）

**锚点**：`InspectorPanel` 有列表；`TimelinePanel` **零** `volumeKeyframes` 引用  

打点只能在检查器看数字，轨上无菱形/包络。

**收口**：选中片段叠加包络折线；拖点改 `atSec`。

---

### 4.11 ⚠ SE-DEEP-11 · P2 · 建议系统遗留 `patch: {}` 噪声

**锚点**：编排器多处仍写 `patch: {}`（trim/transition/ducking/beat-cut）  

`ops` 已生效，但空 `patch` 保留误导审计与旧测试。  

**收口**：类型上 `patch?` 可选；新建议省略；清理存量。

---

### 4.12 ⏸ SE-DEEP-12 · P3 · 参考视频 beat-cut 依赖 `analyzeReferenceVideo`

**锚点**：`orchestrateViralTimeline` try/catch 静默降级  

无参考分析时无 tip；有分析结果时 trim ops 可用。产品若宣传「卡点剪辑」需明示依赖与失败态。

**收口**：编排结果条显示「未做听音/未分析参考」；勿称 beat-sync（跨域 DR-05 同类问题）。

---

### 4.13 ⚠ SE-DEEP-13 · P2 · 替换对比播放器无同步预览头

**锚点**：`SmartReplacePanel` compare 步双 `<video controls muted>`  

左右独立 scrub，难做帧对齐验收。

**收口**：共用 currentTime / 播放头；或 Remotion 双实例锁帧。

---

### 4.14 🏗 SE-DEEP-14 · P2 · SmartReplace 蒙版坐标系与导出分辨率

**锚点**：画布笔刷 → `buildMaskBlob` → 上传  

若抽帧分辨率 ≠ 成片/编辑模型输入尺寸，mask 错位会导致「圈了 A 改了 B」。缺分辨率对齐单测。

**收口**：mask 与 frame 同像素尺寸断言；缩放策略写进注释 + 测例。

---

## 5. 跨域未完成索引（剪辑台会踩到，细节在他档）

| 源文档 | 与剪辑台相关的未完成 |
|--------|----------------------|
| `NX9-DEEP-OPEN-LOOPS-2026-08-12.md` | DEEP-01/02 假绿链、poll 通道、巨型单文件 |
| `NX9-DEEP-REMAINING-GAPS-2026-08-12.md` | DR-01/02 全局镜表串台；DR-06 音量可视；DR-07 BGM 真生成 |
| `NX9-DIRECTOR-DESK-DEEP-RESIDUALS-*.md` | 审片 adopt / 3D 残留（影响 take 写回可见性） |
| `NX9-ASSET-LIBRARY-OPEN-LOOPS.md` | 主路径多已 ✅；成片精剪/波形类加深仍开放 |
| `docs/8.12/NX9-CHARACTER-FACE-SCULPT-2026-08-12.md` | FACE-P2/P3/P4 未做（替换人物时身份锁仍弱） |

---

## 6. 建议排期（只排本文新票）

| 波次 | 票 | 目标 |
|------|----|------|
| **W1 诚实** | SE-DEEP-01、02、03、09 | 建议不空转；预览/导出引擎一致；未实现转场不说谎；FFmpeg 不能进交付 |
| **W2 替换闭环** | SE-DEEP-04、05、06；SE-SPEC-01 | @附图；take adopt；可取消；可选 edit-masked |
| **W3 稳定** | SE-DEEP-07、08、14 | 任务落盘；禁 base64 整片；mask 对齐测例 |
| **W4 打磨** | SE-SPEC-02～05；SE-DEEP-10、13 | 追踪；波形；overlay；包络可视；对比同步 |
| **后置** | SE-DEEP-11、12 | 清 patch 噪声；beat-cut 文案 |

---

## 7. 验收口令（下一轮复测用）

1. 爆款编排后「template-patch」要么真写入 templateVars，要么根本不进待确认。  
2. 漫剧 Remotion：台内 Player 与「预览渲染」成片转场/字幕/音量包络一致。  
3. `@场景:xxx` 替换时网络请求带上场景参考图，不只是 Prompt 长文。  
4. 采纳替换后导演台该镜可看到新 `videoVersions`，且可选已 adopt。  
5. video-edit：重启 server 后 status 仍可查；长视频不 OOM；面板有取消。  
6. 选 wipe 转场时 UI 明示未实现或真能看出 wipe。

---

## 8. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-08-12 | 初版：汇总 SPEC 仍开放 + 当日深挖 SE-DEEP-01～14；与已销 SE-BASE / SE-01～04 划界 |
