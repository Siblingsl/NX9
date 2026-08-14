# `docs/8.12` 功能完成度对照台账

> **日期**：2026-08-12（对照当日仓库代码）  
> **方法**：以 `docs/8.12/` 各审计文档票项为清单；以同目录 `*-IMPLEMENTATION-LOG-*` 为实施声称；再以源码 / 测例 / 资产存在性抽检复核。  
> **不纳入票清单**：`NX9-812-DEEPSEEK-V4-FLASH-STRICT-DEV-PROMPT.md`（提示词，非功能审计）。  
> **判定口径**：
>
> | 本台账状态 | 含义 |
> |------------|------|
> | **全部完成** | 锚点代码存在，行为与文档收口一致；有测例或可静态证伪；无已知运行时断点 |
> | **部分完成** | 主路径已接线，但仍有诚实降级、规格未满、运行时失败报告、或缺人工浏览器复验 |
> | **未完成** | 代码未落地，或明确 ⏸ 产品后置 / 工程债未拆 / 缺资产导致无法验收 |
>
> 审计原文里的 ❌/⚠ 是「发现时的缺口」；本台账是「对照现行代码后的完成度」。

---

## 0. 总览

| 来源审计文档 | 全部完成 | 部分完成 | 未完成 |
|--------------|----------|----------|--------|
| `NX9-DEEP-REMAINING-GAPS-2026-08-12.md` | 9 | 0 | 2 |
| `NX9-DEEP-OPEN-LOOPS-2026-08-12.md` | 16 | 0 | 2 |
| `NX9-DIRECTOR-DESK-DEEP-RESIDUALS-2026-08-12.md` | 13 | 0 | 1 |
| `NX9-STORYBOARD-DESK-DEEP-LOOPS.md` | 12 | 0 | 0 |
| `NX9-PICTURE-GEN-NODE-OPEN-LOOPS-R4.md` | 10 | 0 | 0 |
| `NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R3.md` | 13 | 0 | 1 |
| `NX9-SMART-EDIT-OPEN-LOOPS-DEEP-2026-08-12.md` | 19 | 0 | 2 |
| `NX9-SCRIPT-DESK-DEEP-AUDIT-R3.md` | 13 | 0 | 0 |
| `NX9-CHARACTER-FACE-SCULPT-2026-08-12.md` | 15 | 0 | 7 |
| **合计（去重前按文档计）** | **116** | **0** | **16** |

> 跨文档同根因票（如 DR-05≈DEEP-16、DR-08≈VG-48、捏模↔DEEP-13）在各文档下各记一行，便于按文档勾验；§9 另给去重后的「仍未闭环」总表。

**证据索引（实施日志）**：

| 域 | 实施日志 |
|----|----------|
| DR | `NX9-DEEP-REMAINING-GAPS-IMPLEMENTATION-LOG-2026-08-12.md` |
| DEEP | `NX9-DEEP-OPEN-LOOPS-IMPLEMENTATION-LOG-2026-08-12.md` |
| DD | `NX9-DIRECTOR-DESK-DEEP-RESIDUALS-IMPLEMENTATION-LOG-2026-08-12.md` |
| SB | `NX9-STORYBOARD-DESK-DEEP-LOOPS-IMPLEMENTATION-LOG-2026-08-12.md` |
| PG | `NX9-PICTURE-GEN-NODE-OPEN-LOOPS-IMPLEMENTATION-LOG-2026-08-12.md` |
| VG | `NX9-VIDEO-GEN-NODE-OPEN-LOOPS-IMPLEMENTATION-LOG-2026-08-12.md` |
| SE | `NX9-SMART-EDIT-OPEN-LOOPS-IMPLEMENTATION-LOG-2026-08-12.md` |
| Script | `NX9-SCRIPT-DESK-DEEP-AUDIT-IMPLEMENTATION-LOG-2026-08-12.md` |
| FACE | `NX9-CHARACTER-FACE-SCULPT-IMPLEMENTATION-LOG-2026-08-12.md` |

---

## 1. 全部完成

### 1.1 来自 `NX9-DEEP-REMAINING-GAPS-2026-08-12.md`

| 票号 | 一句话 | 代码抽检 |
|------|--------|----------|
| DR-01 | 批审 `approveAllKeyframes` 只写链镜表 | `core-pipeline-runner.ts` → `patchShotOnChainGraph` |
| DR-02 | 审片工作区读写链镜表 | `ReportWorkspace.tsx` → `patchUpstreamShot` / `resolveShotsForBlock` |
| DR-03 | `simpleConcatExport` 只消费连接链 | `core-pipeline-runner.ts` DR-03 注释 + Studio 强制 `chainShots` |
| DR-04 | continuity 不再「一 issue 全 failed」 | `parseContinuityLlmJson` + 写回降级 `review` |
| DR-05 | beat-sync 诚实标「未听音」 | meta `algorithm:'bpm-interval'` |
| DR-06 | 成片音量关键帧时间轴可视 | `TimelinePanel` `VolumeEnvelope` |
| DR-07 | BGM 真生成未接入时明确失败 / 仅导入 | gateway 明确 BadRequest + UI 导入路径 |
| DR-09 | ClipGen 死卡 run 委托 + 孤儿 pill 删除 | `ClipGenBlock.run` → `runFlowBatch`；`GenConfigPillBar` 已删 |

### 1.2 来自 `NX9-DEEP-OPEN-LOOPS-2026-08-12.md`

| 票号 | 一句话 | 代码抽检 |
|------|--------|----------|
| DEEP-01 | `seedance-chain` 假成功旁路删除 | migrate → `clip-gen`；flow-runner 无独立执行分支（`vg-r2-p3` 守卫） |
| DEEP-02 | `motion-story` / clip-chain 旁路删除 | 同上 |
| DEEP-03 | `variant-fork` 改 skipped + noop | `flow-runner.ts` `status:'skipped'` |
| DEEP-04 | 分镜台画布「等待」不再假绿 | skipped / noop 路径 |
| DEEP-05 | ClipGen 死卡 run 委托 | 同 DR-09 |
| DEEP-06 | 孤儿 `VoiceCastPanel` / GenConfigPillBar 删除 | 仓库无 `VoiceCastPanel.tsx` |
| DEEP-07 | pollVideo 绑创建 `providerBaseUrl` | pending 任务携带通道 |
| DEEP-08 | resume 不污染已更新成片版本 | 校验镜版本并归档候选 |
| DEEP-10 | 并发 UI 上限对齐 1–8 | `VideoWorkspace` select `[1..8]` |
| DEEP-11 | 巨型单文件拆分（素材库 + 分镜台） | `AssetLibraryModal.tsx` **≈3522 → 18** 行 + `use-storyboard-desk.tsx` **3427 → 1469** 行（A8/A11 收口） |
| DEEP-12 | 技能轨降级结果携带结构化 `errorCode`，chat hint 可渲染 | `script-desk-runner.ts` 四条 fallback 返回 `errorCode`；`use-script-desk-agent.ts` 消息落 `errorCode` |
| DEEP-14 | 台账/日志同步（元问题） | 各 IMPLEMENTATION-LOG 已落档 |
| DEEP-15 | 浏览器级回归已记档 | `docs/8.12/NX9-A7-BROWSER-REG-2026-08-12.md`：2026-08-13 Windows/Chromium E2E 6/6 通过；真实供应商 smoke 7 SKIP（缺 key） |
| DEEP-16 | beat-sync 名实（同 DR-05） | 同上 |
| DEEP-17 | `prompt-diff` 不再写死 gpt-4o-mini | 读 `d.llmModel / d.model` |

### 1.3 来自 `NX9-DIRECTOR-DESK-DEEP-RESIDUALS-2026-08-12.md`

| 票号 | 一句话 | 代码抽检 |
|------|--------|----------|
| DD-D-01 | 视频写回不盖掉关键帧 `status` 断环 | 只写 `videoStatus`；剪辑 `approvedOnly` 按视频批准 |
| DD-D-02 | 视频审阅 / 批准阶段 | `VideoWorkspace` approve/reject/adopt |
| DD-D-03 | `pendingRepair` 可消费修复 UX | 待修复列表 + 提交清 repair |
| DD-D-04 | 「有 3D」用 `hasDirector3dGuide` | `chain-storyboard.ts` |
| DD-D-05 | 3D 文案与开关一致 | 去掉「暂未开放」假文案 |
| DD-D-06 | 批出不写脏节点 `previewUrl` | 只写 `lastBatchPreviewUrl` |
| DD-D-07 | 默认不注入全局风格锁 | `useGlobalArtDirection:false` |
| DD-D-08 | spawn 不回退全局镜表 | `FlowSurface` 只查链镜 |
| DD-D-09 | 关键帧批次增量落盘可续跑 | receipt + 跳过已成功镜 |
| DD-D-10 | partial「重试失败镜」入口 | `ClipGenBlock` 重试失败 N 镜 |
| DD-D-11 | 混装节点 hydrate 自动拆 | `autoSplitMixedDirector3dGraph` |
| DD-D-12 | `colorCheck=unknown` 不进 auto 批准 | 进 `review` |
| DD-D-13 | 3D 切镜脏确认 | `StageDeckShell.requestShotChange` |

### 1.4 来自 `NX9-STORYBOARD-DESK-DEEP-LOOPS.md`

| 票号 | 一句话 | 代码抽检 |
|------|--------|----------|
| SB-D-01 | 「打开导演台」按链定位，非全画布第一个 | `chain-storyboard-utils` + desk hook |
| SB-D-02 | 复制镜不继承线稿假「已出图」 | 复制纯函数清帧 |
| SB-D-03 | 结构/线稿变更后大图过期诚实 | 签名比对 + 面板文案 |
| SB-D-04 | 本集确认推送已连导演台 `lastHandoff` | 自动推送 + 统一构建 |
| SB-D-05 | 复制/批删深拷贝，不变异共享对象 | runner 纯函数 |
| SB-D-06 | 删除宫格旁路写全局 storyboard | `GridGeneratePanel.tsx` 已删 |
| SB-D-07 | `setShotFrameUrl` 原子写 | 单次函数式写 |
| SB-D-08 | 清线稿进撤销 / 批删文案诚实 | 打磨项已接 |
| SB-D-09 | 会话草稿防抖落盘 | 300ms debounce |
| SB-D-10 | review-gate 按链找导演台 | `review-gate-session.ts` |
| SB-D-12 | 清线稿/复制统一写 `null` | 与 SB-D-02 同源收口 |

### 1.5 来自 `NX9-PICTURE-GEN-NODE-OPEN-LOOPS-R4.md`

| 票号 | 一句话 | 代码抽检 |
|------|--------|----------|
| PG-37 | 运行不污染用户 `content` | `runPrompt` 优先；`resolvePictureGenRunPrompt` |
| PG-38 | 注入参考可见 + 模式芯片诚实 | UpstreamStrip + refs + 模式回写 |
| PG-39 | 自动绑镜保留 spawn 指定镜 | 自动绑镜 effect |
| PG-40 | 删生成图同步镜 `firstFrame` | `writePictureShotPatch` |
| PG-41 | message / 发送稿工作区可见 | 顶栏 / 折叠发送稿 |
| PG-42 | 继续查询账本回流 | `picture-gen-commit` + 测例 |
| PG-43 | 多镜选镜下拉 | `PictureWorkspace` |
| PG-44 | 预览/导演旁路账本边界文档化 | runner 注释 + provenance 测例 |
| PG-45 | 历史可还原用户提示词 | `picture-gen-history` + 恢复按钮 |
| PG-46 | 全景比例不粘滞 | `patchPictureGenMode` 记忆 `nonPanoramaAspectRatio` + 测例 |

### 1.6 来自 `NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R3.md`

| 票号 | 一句话 | 代码抽检 |
|------|--------|----------|
| VG-35 | 级联多镜不再坍成单镜 | gatherUpstream + 链镜优先逐镜 |
| VG-36 | 级联/导演批次走 `videoVersions` | `appendStoryboardVideoVersion` |
| VG-37 | 成功不改写用户 `content` | `lastCompiledPrompt` / `batchSummary` |
| VG-38 | 单镜继续查询写链 + version | `VideoWorkspace` resume |
| VG-39 | 级联多镜参考排除本批首帧 | flow-runner |
| VG-40 | 文生视频不强制带首帧 | `clip-gen-request` |
| VG-41 | 缺尾帧 / 缺参考阻断 | 组装器 blocked |
| VG-42 | `modelParams` 解析失败明示 | 校验 + 红字 |
| VG-43 | 跳过未批审镜工作台可汇总 | skipped + message |
| VG-44 | linked 子集保留；retry 可停 | `VideoWorkspace` |
| VG-45 | Bridge/omni 吃链上成片 | chain → `clips` |
| VG-46 | 删除 `bridge-clip` 假成功 | flow-runner 无分支（`vg-r3` 守卫） |
| VG-47 | 迁移清扫孤儿 `videoMode` | migrate 补丁归一 |

> 同文档 §「已收口勿回潮」VG-13～34 系列：以 R3 文首 ✅ 表 + 守卫测例为准，本台账不重复开票。

### 1.7 来自 `NX9-SMART-EDIT-OPEN-LOOPS-DEEP-2026-08-12.md`

| 票号 | 一句话 | 代码抽检 |
|------|--------|----------|
| SE-SPEC-01 | 蒙版编辑专用契约 | `picture.controller` + 面板 `fal-inpaint` |
| SE-SPEC-02 | 跨帧追踪诚实终态（能力本体后置） | `supportsFrameTracking:false`；直接替换禁用+入口守卫+测例 |
| SE-SPEC-05 | 多供应商诚实终态（第二家后置） | 注册表/UI/服务端一致；未知 `providerId` 明确拒绝 |
| SE-DEEP-12 | beat-cut 工程子集（音频听感后置） | `analyzeReferenceVideo` 真产出 trim ops + `meta.algorithm/audioAnalyzed` |
| SE-SPEC-03 | 时间轴音频波形 | `TimelinePanel` WebAudio peaks |
| SE-SPEC-04 | Overlay 位姿编辑 | Inspector + `TimelineClip.overlay` |
| SE-DEEP-01 | `template-patch` 不再空转采纳 | 编排停产 + 旧建议明示无需采纳 |
| SE-DEEP-02 | 预览/导出引擎不一致有警告 | `PreviewPlayer` 引擎警告条 |
| SE-DEEP-03 | wipe/shader 不再静默 | Inspector 旁注仅 fade；chips 移除 wipe |
| SE-DEEP-04 | @素材附参考图 | `collectAssetMentionUrls` + Gemini refs |
| SE-DEEP-05 | 采纳可选写回正式版 | 二选一 + `adoptStoryboardVideoVersion` |
| SE-DEEP-06 | 智能替换 / video-edit 可取消 | AbortController + DELETE task |
| SE-DEEP-07 | video-edit 任务落盘 | `data/render-tasks/video-edit.json` |
| SE-DEEP-08 | 本地媒体不整段 base64 喂 Fal | Fal REST storage 流式 PUT |
| SE-DEEP-09 | FFmpeg 不能进交付 | 禁用确认/同步入口 |
| SE-DEEP-10 | 音量包络可视（同 DR-06） | 时间轴折线 + 菱形关键帧 |
| SE-DEEP-11 | 建议 `patch:{}` 噪声清除 | `SmartSuggestion.patch?` 可选 |
| SE-DEEP-13 | 替换对比播放头同步 | 双视频 timeupdate 互锁 |
| SE-DEEP-14 | 蒙版分辨率断言 | `assertMaskFrameAligned` + 测例 |

### 1.8 来自 `NX9-SCRIPT-DESK-DEEP-AUDIT-R3.md`

| 票号 | 一句话 | 代码抽检 |
|------|--------|----------|
| 1.1 | pending 按集增量合并，不整表抹掉 | `applyPackagePatch` upsert |
| 1.2 | debounce 进自动存/关台/确认/送分镜 | flush registry |
| 1.3 | 批量重写累加 session + pending 互锁 | runner 本地累加 |
| 2.1 | Ctrl+Z 同步回滚 agentSession | undo 栈含 session |
| 2.2 | 台级 Ctrl+Z 先丢弃 debounce 幽灵 | `resetDebouncedFields` |
| 2.3 | 重试失败集保留 `episode.id` | rewrite 语义 |
| 2.4 | 确认/送分镜前强制 flush | checklist + flush |
| 3.1 | 公共库角色改名只读提示 | UI 禁改 |
| 3.2 | 改名同步未应用 pending | Apply 不写旧名 |
| 4.2 | 删除 `clearSession` 死代码 | 已删 |
| 4.3 | 删集清洗 `selectedEpIds` | 无幽灵选中 |
| 3.3 | Agent 技能轨 SSE | `script-desk/chat-stream` + client `scriptDeskChatStream` + runner onChunk |
| 4.4 / 4.5 | details 键盘 + 回归测例 | 测例已补 |

### 1.9 来自 `NX9-CHARACTER-FACE-SCULPT-2026-08-12.md`

| 票号 / 项 | 一句话 | 代码抽检 |
|-----------|--------|----------|
| P0 | faceRig 字典 / 读写 / Prompt / 左栏 | shared + `CharacterFaceRigSection` |
| P1 | 代理网格 + 切片 6 项 + 全屏台 | `CharacterSculptScene` + Modal |
| FACE-02 | Handle 控制点拖拽 | `sculpt-handles.ts` + Scene 拾取 |
| FACE-03 | 对称锁 + `sideValues` / `asymmetric` | 测例 `face-sculpt-p2-handles` |
| FACE-04 | 机位键 + 台内 undo | `sculpt-cameras` + Modal undo |
| FACE-05 | 定妆出图写 faceLockUrl | `exportCanonicalImage` + Playwright 201 上传 + 512×768 PNG |
| FACE-06 | 定妆健康条三项 | `assessCharacterFaceRigHealth`（`faceRigNotRendered` 等） |
| DRIFT-01 | `meshContractVersion` 已进类型/写回 | Modal 定妆写契约版本 |
| DRIFT-02 | cameras / lights / handles 模块已建 | 三文件均存在并被 Scene 使用 |
| DRIFT-05 | 锁定角色守卫提示 | Modal `consistency.locked` 警示 |
| DRIFT-06 | 布局以现行右栏收口（不造假左窄条） | 实施日志记档收口 |
| DRIFT-07 | 兼容徽章可展开 missing | Modal 抽屉 |
| DRIFT-08 | 代理骨叙述按代码收紧 | 设计整理档已改 |
| HONEST-01 | 「工程代理 · 非成品基模」徽标 | Modal 顶栏 |
| HONEST-02 | 非切片标「仅 Prompt」 | 展开参数文案 |

---

## 2. 部分完成

> 2026-08-13 后无部分完成项：DEEP-15 已转 §1.2（浏览器回归记档完成）；DD-D-14 浏览器 mock / 双集 / 刷新持久化证据已闭环，真实供应商小样本移 §3.1（缺 key 硬阻塞）。

---

## 3. 未完成

### 3.1 功能断点 / 产品后置（⏸）

| 票号 | 来源文档 | 缺口 | 阻塞原因 |
|------|----------|------|----------|
| **DR-08** | `NX9-DEEP-REMAINING-GAPS-2026-08-12.md` | VG `audioUrl` 音画对齐口径未定；工程子集已齐：episode-queue 常量已删、UI 文案诚实、audioUrl 仅数据透传 | 产品 API 未定 |
| **VG-48** | `NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R3.md` | 同 DR-08；工程子集已齐（B1） | 产品后置 |
| **DEEP-09** | `NX9-DEEP-OPEN-LOOPS-2026-08-12.md` | episode-queue / audioUrl；工程子集已齐：常量已删、`ClipGenBlock` 文案诚实、audioUrl 仅透传参考 | 同根因；能力本体待产品 API 口径 |
| **SE-DEEP-12（音频听感能力本体）** | `NX9-SMART-EDIT-OPEN-LOOPS-DEEP-2026-08-12.md` | 音频听感 / onset 检测的 beat-cut | 依赖产品指定音频分析方案；镜头节奏工程子集已真接入并带 `meta`/notes 诚实元数据 |
| **FACE-01** | `NX9-CHARACTER-FACE-SCULPT-2026-08-12.md` | 正式基模加载路径已接入（manifest 校验 + 404/不合格回退代理） | 无正式 GLB 资产，资产未到位时仍回退代理 |
| **FACE-07** | 同上 | 缺 `nx9-character-base.glb` + manifest + LICENSE；加载路径/manifest 校验/契约回退已齐（B2） | 美术资产未交付（仓库 0 命中） |
| **FACE-08** / **DRIFT-03** | 同上 | `driver: material` 已驱动命名材质通道；无通道兼容报告标 missing | 正式材质通道待美术资产；代码子集已闭环（B3） |
| **FACE-09** | 同上 | `StageActor` ↔ `faceRig.body` 已桥接（身高/肩/躯干/腿/颈/手） | P4 可选后置已转为代码子集闭环（B4），待正式基模资产验收 |
| **FACE-10** | 同上 | 3D 表情 / 发型服装 / 照片拟合 | 身份未锁前不做 |
| **DEEP-13** | `NX9-DEEP-OPEN-LOOPS-2026-08-12.md` | 捏模终局（正式模/材质/舞台桥） | 与 FACE-01/07/08/09 同源；工程子集已齐（GLB 加载/manifest 校验/回退代理、材质驱动、舞台桥），正式资产仍待交付 |
| **DEEP-18** | 同上 | 素材库情绪/爆点回库、团队库、LoRA | 明确「可加深非断点」，本轮不实施 |
| **DD-D-14（真实供应商小样本）** | `NX9-DIRECTOR-DESK-DEEP-RESIDUALS-2026-08-12.md` | 真实图片 → 视频 → chain 字段小样本未跑 | 无 `NX9_PROVIDER_*` / `NX9_REAL_PICTURE_URL` / `NX9_REAL_VIDEO_URL`；2026-08-13 smoke 7 SKIP |
| **HONEST-03** | FACE 档 | 对外宣传「真 3D 捏脸」合规 | 非代码票；应用内已无「真 3D 捏脸」宣称，捏模台保持「工程代理 · 非成品基模」徽标；P4 前对外宣传仍须阶段诚实 |

### 3.2 工程债（抬回归成本，非主链功能断点）

| 票号 | 来源文档 | 现状（抽检） | 说明 |
|------|----------|--------------|------|
| ~~**ENG-01** / **SB-D-11** / **DEEP-11（分镜）**~~ | REMAINING-GAPS / STORYBOARD / DEEP-OPEN | `use-storyboard-desk.tsx` **3427 → 1469** 行 | 已拆 / 全部完成（5 个 ops 模块，行为不变） |
| ~~**ENG-02** / **Script 4.1**~~ | REMAINING-GAPS / SCRIPT-R3 | `ScriptDeskBlock.tsx` **2265 → 1044** 行 | 已拆 / 全部完成（4 个 ops hooks，行为不变） |
| ~~**ENG-03**~~ | REMAINING-GAPS | `flow-runner.ts` **2502 → 335** 行 | 已拆 / 全部完成（6 个 ops 模块，行为不变） |
| ~~**DEEP-11（素材库）**~~ | DEEP-OPEN | `AssetLibraryModal.tsx` **≈3522 → 18** 行 | 已拆 / 全部完成（23 个 `modal/` 子模块，行为不变） |
| ~~**DEEP-12**~~ | DEEP-OPEN | `script-desk-runner.ts` 四条 fallback 返回 `errorCode` | 已闭环 / 全部完成（降级结果携带结构化错误码，chat hint 可渲染；守卫单测 + A12 E2E 2/2） |

---

## 4. 按文档的「一眼结论」

| 文档 | 结论 |
|------|------|
| **DEEP-REMAINING-GAPS** | P0/P1 串台票（DR-01～04）与诚实票（05～07、09）**已闭环**；剩 audioUrl 口径；ENG-03 flow-runner 体积债已拆（2502→335 行） |
| **DEEP-OPEN-LOOPS** | 假成功旁路 / 孤儿 / 通道绑定 **已闭环**；DEEP-15 浏览器回归已记档；DEEP-11（素材库）巨石已拆至 18 行；DEEP-12 错误码已闭环；剩 audioUrl 口径（DEEP-09） |
| **DIRECTOR-DESK** | DD-D-01～13 **代码闭环**；DD-D-14 浏览器 mock/刷新持久化证据已闭环，真实供应商小样本缺 key ⏸ |
| **STORYBOARD-DESK** | SB-D-01～12 **已闭环**；主 hook 已拆至 1469 行 |
| **PICTURE-GEN R4** | PG-37～46 **已闭环**；全景比例经 `nonPanoramaAspectRatio` 记忆恢复 |
| **VIDEO-GEN R3** | VG-35～47 **已闭环**；VG-48 audioUrl ⏸ |
| **SMART-EDIT** | 19 张票 **全部闭环（工程+诚实终态）**；跨帧追踪、第二供应商、音频听感为产品后置，UI/服务端已无假可点或静默回落 |
| **SCRIPT-DESK R3** | 数据安全票与技能轨 SSE **已闭环**；主文件已拆至 1044 行（A9 收口） |
| **CHARACTER-FACE-SCULPT** | P0/P1/P2 + 定妆健康/模块漂移 **已闭环**；B2–B4 工程子集已齐（GLB 加载路径/manifest 校验/契约回退、材质驱动、舞台桥）；正式 GLB 资产与表情仍待交付 |

---

## 5. 去重后：仍未闭环总表（给下一轮开工用）

### 必须产品拍板 / 美术交付

1. **音画对齐 `audioUrl`**（DR-08 / VG-48 / DEEP-09）——工程子集已齐：episode-queue 常量已删、`ClipGenBlock` 文案「已连接上游音频 · 音画对齐能力未定，仅透传参考」、audioUrl 仅数据透传；能力本体待产品 API 口径  
2. **正式身份基模 GLB + LICENSE**（FACE-01 / FACE-07 / DRIFT-04）——B2 已接入正式 GLB 加载路径 + manifest 校验 + 失败/不合格回退代理（`character-model-loader.ts`，守卫单测通过）；资产未到位时仍回退代理  
3. **材质驱动 + 舞台身段桥**（FACE-08 / FACE-09）——B3 `material-drivers.ts` 真驱动命名材质通道、无通道兼容报告标 missing；B4 `stage-body-bridge.ts` + `StageActor` 已桥接 `faceRig.body`；两组守卫单测通过  
4. **跨帧追踪 / 第二视频编辑供应商 / 音频听感 beat-cut 能力本体**（SE-SPEC-02 / SE-SPEC-05 / SE-DEEP-12）——诚实终态已齐，仅剩产品选型  
5. **真实供应商小样本（DD-D-14）**：无 `NX9_PROVIDER_*` / 真实图片/视频 URL key，7 项 smoke 全 SKIP；浏览器 mock 与双集刷新持久化已由 A7 E2E 证据闭环

### 可纯工程推进

（当前无剩余：A11 DEEP-11（素材库）与 A12 DEEP-12 均已闭环，见 §1.2 / §3.2）

### 明确不做（勿再当缺口开票）

- DEEP-18 素材库「可加深」三项  
- FACE-10 表情/服装/照片拟合（身份锁前）  
- 审计文内「已收口 / 勿再开票」矩阵（导演台旧 P0、PG-25～36、VG-13～34、SE-01～04 等）

---

## 6. 抽检方法与局限

**已做**：关键词/文件存在性抽检；关键 runner / Modal / sculpt / health / 测例文件核对；巨型文件行数实测；GLB 资产 glob=0；A7 浏览器回归 6/6 E2E 通过（2026-08-13 Windows/Chromium）。

**未做**：真实供应商出片（无 key，7 SKIP）；F-046/F-050 浏览器路径（单测 + 代码审查覆盖，待人工复验）；逐票全量 runtime 手测。

因此：标「全部完成」= **代码面可证伪闭环**；不等于「已在生产账号跑通」。部分完成 / 未完成中的「待人工复验」项，下一轮应以浏览器清单为准，不得仅凭 IMPLEMENTATION-LOG 口头完票。

---

## 7. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-08-12 | 初版：对照 `docs/8.12` 九份审计 + 九份实施日志 + 当日代码抽检，产出完成/部分/未完成台账 |
| 2026-08-12 | A1 FACE-05 收口：视口就绪闸门 + 导出 try/finally 双帧；Playwright 真实浏览器验证上传 201、512×768 PNG、定妆已锁、0 page error |
| 2026-08-12 | A2 PG-46 全景比例不粘滞：进入全景记忆 nonPanoramaAspectRatio，退出/回落恢复上次非全景比例；32 例相关 vitest 通过、web typecheck 通过 |
| 2026-08-12 | A3/A4/A5 智能剪辑诚实终态：SE-SPEC-02 直接替换禁用+能力位；SE-SPEC-05 未知供应商明确拒绝；SE-DEEP-12 beat-cut 元数据与 notes；相关 17+4+web/server typecheck 通过 |
| 2026-08-12 | A6 Script 3.3 技能轨 SSE：新增 chat-stream 端点/客户端流式解析/runner onChunk/面板 streamPreview；web 定向 8 passed + server typecheck 通过 |
| 2026-08-13 | A7 DEEP-15/DD-D-14/ENG-04：浏览器回归 6/6 E2E 通过并落档 `docs/8.12/NX9-A7-BROWSER-REG-2026-08-12.md`；真实供应商 7 SKIP 硬阻塞；DEEP-15 转全部完成、ENG-04 清出工程债、DD-D-14 移 §3.1 ⏸ |
| 2026-08-13 | A8 ENG-01/SB-D-11/DEEP-11：use-storyboard-desk 3427→1469 行，拆为 breakdown-queue / line-art / handoff / shot-writeback / sheet-export ops；行为不变，web typecheck + 全量 vitest 76 文件 480 通过 + 分镜台 E2E 2/2 通过 |
| 2026-08-13 | A9 ENG-02/Script 4.1：ScriptDeskBlock 2265→1044 行，拆为 actions/agent/edits/drafts 4 个 ops hooks；行为不变，web typecheck + 全量 vitest 76 文件 480 通过 + 分镜链路 E2E 2/2 通过 |
| 2026-08-13 | A10 ENG-03：flow-runner.ts 2502→335 行，拆为 base/clip-gen/media/story/tool/legacy 6 个 ops 模块；行为不变，web typecheck + 全量 vitest 77 文件 484 通过 + 定向 16 文件 102 通过 |
| 2026-08-13 | A11 DEEP-11（素材库）：`AssetLibraryModal.tsx` **≈3522 → 18** 行，拆为 `asset-library/modal/` 23 个子模块；行为不变，web typecheck + 全量 vitest 79 文件 492 通过 + 1920×1080 素材库 Modal 自检通过 |
| 2026-08-13 | A12 DEEP-12 错误码结构化：技能轨降级结果携带 `errorCode`、chat hint 可渲染；新增守卫单测，定向 13 + 桌面编剧套件 42 vitest 通过 + A12 聊天区 E2E 2/2（1920×1080 / 1280×720）通过 |
| 2026-08-13 | B1–B5 工程子集收口：audioUrl 消费点诚实透传；B2 正式 GLB 加载路径/manifest 校验/404 回退代理；B3 材质驱动 + 无通道 missing 报告；B4 StageActor↔faceRig.body 舞台桥；B5 应用内无「真 3D 捏脸」宣称；新增 4 组单测 11 passed + 既有捏模回归 6 文件 53 passed，捏模台定妆 + 导演台 E2E 3/3 通过 |
| 2026-08-13 | 服务端旧验收测试随拆分落点同步：19 个失败套件改读拆分后真实模块（flow-runner-ops / asset-library/modal / script-desk 子模块等），断言改为新实现契约；server vitest 58 文件 960 passed |
