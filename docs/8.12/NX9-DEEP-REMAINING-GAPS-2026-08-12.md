# NX9 深挖残留问题 · 2026-08-12

> **日期**：2026-08-12  
> **方法**：对照已销票审计文档，**重读现行代码**找「文档已绿、行为仍脏」与「主链外仍在撒谎」的项。  
> **范围**：全画布执行层、审阅/批审、导出、工具节点、剪辑台、编剧台、捏脸、工程债。  
> **原则**：只记代码可证伪的问题；已在导演台加深轮闭环的项（像素质检、DD-R-01 门禁、音量关键帧 schema、3D 切镜守卫）**不开重复票**。  
> **存放**：`docs/8.12/`（本轮深挖专档）

---

## 1. 一句话结论

导演台 / 图像节点 R3 / 视频节点 R2 / 素材库主路径大多已销票后，**现行最大风险不再是「缺按钮」，而是三处仍会骗状态或串台的路径**：

1. **全局镜表写回未死透**——批审、审片工作区、简易导出仍读写 `workspace.storyboard`，多链生产态会改错账本或导出错集。  
2. **连续性检查写回是「有问题就全镜失败」**——且 LLM JSON 常解析失败时静默不写回。  
3. **产品能力诚实边界仍糊**——beat-sync 不做听音分析、BGM 真生成未接入、音量关键帧无时间轴可视、捏脸 P2+ 未开、死组件仍留仓。

工程债（分镜 hook ~3.2k 行、编剧主文件 ~2.1k 行）继续抬高任何后续改动的回归成本。

---

## 2. 判定符号

| 符号 | 含义 |
|------|------|
| ❌ | 断点或状态撒谎，建议开票 |
| ⚠ | 半闭环 / 诚实不足 / 易误用 |
| 🧟 | 死代码或无引用孤儿 |
| ⏸ | 产品明确后置，但需记档防回潮 |
| ✅ | 本轮复核已诚实或已链隔离（勿再开） |

---

## 3. P0 / P1 · 仍会串台或污染生产态

### ❌ DR-01 · P0 · 批审 `approveAllKeyframes` 只写全局镜表

**锚点**：`apps/web/src/engine/core-pipeline-runner.ts` ≈L298–319  
**调用方**：`useStudioDesk.runApproveAll`、`playbook-runner`

```ts
const shots = activeEpisodeShots(doc.storyboard);
// ...
doc.updateShot(shot.id, { keyframeStatus: 'approved', ... });
```

链镜表才是分镜台 / 导演台 / clip-gen 的生产 SSOT。此函数批准的是**工作区镜像全局集**，画布多链场景下：

- 用户以为批过了链上镜头 → 链上仍 `review` → 门禁不放行；或  
- 全局被改、链未改 → 审片 UI 与执行层各看各的。

**收口**：按 `findDeskIdForShot` + `patchShotOnChainGraph`（同文件已有 VG-10 写回）改写；Studio / Playbook 入口禁止再碰全局 `updateShot`（除非显式「仅旧档无链」兼容且打标）。

---

### ❌ DR-02 · P0 · 审片工作区 `ReportWorkspace` 读写全局 storyboard

**锚点**：`ReportWorkspace.tsx` L67–68、L126+  

```ts
const shots = useMemo(() => activeEpisodeShots(storyboard), [storyboard]);
const updateShot = useWorkspaceDocument((state) => state.updateShot);
```

批准 / 打回走全局 `updateShot`，列表也来自全局 active episode。与导演台已修的「显式 shots + episodeId」宫格门禁（DD-P1-03）**再次分叉**。

**收口**：镜头来源改为 `getAllChainShots` / 上游 desk 投影；写回走 `patchUpstreamShot` 或 `patchShotOnChainGraph`。无链时 blocked，禁止静默写全局。

同族：`ExportWorkspace.tsx` 仍 `activeEpisodeShots(storyboard)` + 调用 `simpleConcatExport`（见 DR-03）。

---

### ❌ DR-03 · P1 · `simpleConcatExport` 仍挂在 Studio / 导出工作区 / Playbook

**锚点**：`core-pipeline-runner.ts` L812+（已 `@deprecated` + dev warn）；调用：`useStudioDesk`、`ExportWorkspace`、`playbook-runner`

行为：读全局 `activeEpisodeShots(doc.storyboard)` 做 FFmpeg concat。F-003「链优先」在**卡面 export-pack runner** 已修，但工作室「简易拼接」旁路未迁。

**收口**：删旁路或改为链感知；UI 文案标明「仅连接链已采用视频」；测例禁止再断言全局 shots。

---

### ❌ DR-04 · P1 · continuity-check：任一 issue → 上游**全部** shot 标 failed

**锚点**：`flow-runner.ts` continuity-check 分支 ≈L1712–1724

```ts
const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
if (issues.length > 0) {
  for (const shotId of targetShotIds) {
    patchUpstreamShot(..., shotId, {
      keyframeStatus: 'failed',
      status: 'failed',
      keyframeReviewNote: `连续性: ${issues.slice(0, 3).join('; ')}`,
    });
  }
}
```

缺陷：

1. **无镜级映射**：模型返回的是字符串列表，没有 shotId；却把 `upstream.shotIds` 整表打 failed。  
2. **JSON 解析脆弱**：`proxyLlm` 常返回 markdown 围栏；`JSON.parse` 失败则 catch 空过——报告区显示「成功」，镜表零写回（假绿另一面）。  
3. **与产品语义冲突**：连续性警告被写成关键帧 `failed`，导演台 / 视频门禁会整链卡死，且无法区分「真生成失败」与「连贯性建议」。

**收口建议**：

- issues 解析为 `{ shotIndex?, shotId?, message }[]`；无映射则只写节点 `continuityReport`，**不**批量改镜状态；  
- 写回顶多 `keyframeStatus: 'review'` + note，禁止直接 `failed`；  
- 抽 `parseContinuityLlmJson`（去围栏）+ 单测。

> 注：TOOL-05 已修「模型可配 / 超 4 图提示」，**未**覆盖本写回逻辑；勿因旧票已绿而跳过。

---

## 4. P1 / P2 · 能力诚实与体验深缝

### ⚠ DR-05 · P2 · beat-sync 名实不符

**锚点**：`flow-runner.ts` ≈L1896–1912  

只 `probeMediaDuration` + 按用户填的 BPM 等间隔切点，**不分析音频 onset**。节点 success 后用户以为「对齐了鼓点」。

**收口**：改名「按 BPM 估切」或接真实 beat 检测；UI 明示「未听音分析」。

---

### ⚠ DR-06 · P2 · 成片音量关键帧无时间轴可视

Schema / Remotion / Inspector「播放头打点」已落地（导演台加深轮）。`TimelinePanel` **零引用** `volumeKeyframes`——只能在检查器列表里看数字，无法在轨上拖点。

**收口**：轨上菱形标记 + 拖拽改 `atSec`；或至少选中片段时叠加包络折线。

---

### ⚠ DR-07 · P2 · BGM 真生成仍未接入（诚实失败，非假成功）

**锚点**：`gateway-music.service.ts` 恒抛 `BGM_NOT_IMPLEMENTED`  

sound-gen music 模式已不再 TTS 假成功（✅），但产品「一键出 BGM」仍不可用。依赖导入音频。

**收口**：接真实 provider，或目录/芯片标注「仅导入」；账号侧验收记入 `REAL-PROVIDER-VALIDATION.md`。

---

### ⏸ DR-08 · P2 · VG-08 `audioUrl` 音画对齐口径未定

网关无稳定消费通道；死卡/文案若仍宣传「音画对齐」会回潮假 UI。保持产品否决或单独立项，禁止半接线。

---

### ⚠ DR-09 · P2 · 视频卡双实现债（ClipGenBlock vs VideoWorkspace）

- Registry 仍 lazy 加载 `ClipGenBlock`（~750 行），卡面单镜路径与工作台批量路径并存。  
- `GenConfigPillBar.tsx` **仓库内零 import**（🧟 孤儿）。  

**收口**：明确 canvasFirst 唯一入口；删或合并 ClipGenBlock 死枝；删除无引用 PillBar。

---

## 5. 捏脸 / 3D 身份（设计已写、深度未完）

对照 `docs/8.12/NX9-CHARACTER-FACE-SCULPT-2026-08-12.md` 与代码：

| 阶段 | 状态 | 说明 |
|------|------|------|
| P0 参数 + Prompt | ✅ | `faceRig` / 编译器 / 左栏 |
| P1 瘦身视口 | ✅ | `CharacterSculptScene` + 切片 6 项 + 测例 |
| P2 控制点 / 对称 / 台内 undo | ❌ 未做 | 设计 §14.3 |
| P3 规范截图 → `faceLockUrl` | ❌ 未做 | 对出图锁人价值最大的下一刀 |
| P4 正式 GLB + 舞台体型 | ❌ 未做 | `StageActor` 仍为球头胶囊身（设计明确后置，但身份锁无法进导演台机位） |

**深挖结论**：捏脸已能「在库里拧头」，但 **3D 导演台人偶与定妆锁仍断开**——P3 不定妆导出、P4 不换模之前，出片一致性仍主要靠 2D 定妆图 + Prompt。

建议开票：`FACE-P3`（规范截图写 `faceLockUrl`）优先于 P2 拖点（对生产闭环更值钱）。

---

## 6. 工程债（抬回归成本，非功能断点）

| ID | 现状 | 风险 |
|----|------|------|
| ENG-01 | `use-storyboard-desk.tsx` ≈ **3264** 行 | 任何分镜修缝易回归；文档称已拆第一步，主体仍巨石 |
| ENG-02 | `ScriptDeskBlock.tsx` ≈ **2086** 行 | 对话区/顶栏未拆完；§3.5–3.7/3.9（运维、批量重写、字数目标、错误 code）仍 ⏸ |
| ENG-03 | `flow-runner.ts` ≈ **2354** 行 | 工具分支诚实性靠人工巡检；continuity / beat-sync 类问题易漏 |
| ENG-04 | 浏览器级 E2E / 真实供应商放行 | 脚手架 opt-in 已有；账号侧手工放行与 H-02 类浏览器回归仍缺记档 |

编剧台进度表已标 §3.1–3.3/拆分第一阶段 ✅，且代码已有 `proxyLlmStream` + `streamPreview`——**§3.4「无流式」旧结论可能过时**，开工前应单测/手验后改文档，避免重复开票。

---

## 7. 本轮复核：勿再当缺口开票

| 域 | 结论 |
|----|------|
| 导演台 P0/P1 + 像素质检 / DD-R-01 / 3D 切镜守卫 / 音量 schema | ✅ 已销（见导演台缺口文档 §12） |
| HyperFrames 黑片占位 | ✅ `hyperframes.renderer` 缺 producer 时 `ok: false` |
| BGM 占位成功 | ✅ 改为明确 BadRequest |
| sound-gen 画布 Run 无视 soundMode | ✅ 已分发 |
| SE-01～04 剪辑台画布/粗预览/建议冲突/legacy | ✅ 代码与审计第四轮一致 |
| 图像 PG-25～36 / 视频 VG-13～26 | ✅ 以各 R2/R3 闭环表为准 |
| 素材库 OL / UX P0→P2 | ✅ 主路径可验收；勿按旧「未复核」复开 |

---

## 8. 建议收口顺序

```text
DR-01/02  批审 + 审片工作区改链写回          ← 假绿/串台
DR-03     simpleConcatExport 迁链或下线
DR-04     continuity 写回降级 + JSON 解析
FACE-P3   捏脸规范截图 → faceLockUrl
DR-06     音量关键帧时间轴可视
DR-05/07  beat-sync 诚实化 / BGM 真接入或标「仅导入」
DR-09     删 GenConfigPillBar + 收敛 ClipGenBlock
ENG-01/02 继续拆分镜/编剧巨石
账号侧    REAL-PROVIDER-VALIDATION 手工放行记档
```

---

## 9. 验收口诀（本轮新增）

1. **批审改的账本必须等于门禁读的账本**（链 = 链，禁止全局批、链上门）。  
2. **工具节点写回镜头状态必须可映射到 shotId**；映射不了就只写报告，不许整表 failed。  
3. **`@deprecated` 且仍被 Studio/Playbook 调用 = 未退役**。  
4. **「分析 / 对齐 / 生成」文案必须以真实算法/provider 为准**；BPM 估切不得叫听音对齐。  
5. **销票以调用链为准**：修了 runner 不算修完，若 Report/Studio/Playbook 仍走旧全局 API。

---

## 10. 证据索引

| 结论 | 文件 |
|------|------|
| 全局批审 | `core-pipeline-runner.ts` `approveAllKeyframes` |
| 审片全局写 | `ReportWorkspace.tsx` |
| 简易导出全局 | `simpleConcatExport` + `ExportWorkspace.tsx` + `useStudioDesk.ts` |
| 连续性误杀 | `flow-runner.ts` continuity-check |
| beat-sync | `flow-runner.ts` beat-sync |
| 音量无轨可视 | `InspectorPanel.tsx` vs `TimelinePanel.tsx` |
| BGM 未接入 | `gateway-music.service.ts` |
| 孤儿 PillBar | `GenConfigPillBar.tsx`（无引用） |
| 捏脸阶段 | `docs/8.12/NX9-CHARACTER-FACE-SCULPT-2026-08-12.md` §6；`StageActor.tsx` 球头 |
| 行数债 | `use-storyboard-desk.tsx` / `ScriptDeskBlock.tsx` / `flow-runner.ts` |

---

**文档结论**：导演台加深与多节点 R 轮销票之后，下一刀应优先消灭 **全局镜表写回旁路（DR-01～03）** 与 **连续性检查误杀（DR-04）**；其后才是捏脸定妆锁（FACE-P3）与体验诚实项。工程拆分与真实供应商放行并行，不阻塞上述 P0/P1。
