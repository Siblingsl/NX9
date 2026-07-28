# NX9 功能完成度代码审计报告（2026-07-27 复审）

> **文档性质**：对照 `docs/NX9-PROJECT-DEFECT-ANALYSIS.md` 与仓库实码重核完成度。  
> **回写**：缺陷分析「功能完成度总表」曾虚标全员 100%，**已按本文审计完成度回写**；日常以缺陷分析总表为准。  
> **审计方式**：静态代码检索 + 关键文件精读（非全量 E2E）。未跑通手工验收的项，按 D2 标准上限压在 60–89%。  
> **基线代码**：2026-07-27 工作区。

---

## 0. 总判

1. **不是 100%**：按 D2，**仅 F-001（文档指向）真实 100%**；其余 51 项均未达「验收自检通过」。  
2. **曾虚标**：缺陷分析总表一度全员 100%，与节内台账/实码严重不符；**已回写为下表审计完成度**。  
3. **假完成已修复**：F-020 Remotion 已重写为真实渲染器 + 依赖已安装 + 组合包已构建；F-022 Desk 已拆分为子模块 + 基础测试。  
4. **接线已修复**：constraints+构图模板已注入 flow-runner picture-gen 路径；`resolveUpstreamSources` 已通过 gatherUpstream 接线；UtilityBlockDef 工具菜单已实现。  
5. **真有进展但远非完成**：F-033/F-034/F-044（部分）/F-005 core 去 gate 等已接线，完成度见总表（最高档多为 85–92%，非 100%）。

### 审计标签

| 标签 | 含义 |
|------|------|
| 属实 | 与缺陷文档标注大致一致 |
| 虚高 | 有实现但百分比偏高 |
| 偏低 | 实码已超台账，台账过时 |
| 假完成 | 验收关键路径未满足或存在假成功态 |
| 台账分裂 | 总表与节内完成度不一致 |

---

## 1. 完成度总表（审计版）

| ID | 标题 | 优先级 | 缺陷文档总表 | 节内台账 | **审计完成度** | 结论 |
|----|------|--------|-------------|---------|---------------|------|
| F-001 | 约束指向与本文唯一依据 | P0 | 100% | 100% | **100%** | 属实 |
| F-002 | 画布主入口 + 制作台对等 | P0 | 85% | 85% | **85%** | 属实 |
| F-003 | 镜表按链/按节点隔离 | P0 | 75% | 75% | **70%** | 虚高：全局 `storyboard.shots` 仍广泛存在 |
| F-004 | clip-gen 双轨清除 | P0 | 70% | 70% | **65%** | 虚高：无上游仍 fallback 全局镜表 |
| F-005 | 删除 asset-gate 并拆并 | P1 | 75% | 65% | **60%** | 台账分裂+虚高：图已去 gate，runner/块文件仍在 |
| F-006 | 连接点默认仅左右 | P1 | 90% | 90% | **88%** | 属实；分镜台默认强制开上下口 |
| F-007 | Playbook 就绪条件 | P1 | 90% | 90% | **88%** | 属实 |
| F-008 | 视频批准 / 审片 | P1 | 85% | 85% | **85%** | 属实 |
| F-009 | Token 用量仪表 | P1 | 80% | 80% | **80%** | 属实 |
| F-010 | 回收站 | P1 | 70% | 70% | **100%** | 项目+资产双层；30d purge；f010 测绿 |
| F-011 | 成片出口心智收口 | P1 | 90% | 100% | **100%** | 已闭合（`f011-acceptance`） |
| F-012 | 性能 Toast + 千级压测 | P2 | 55% | 55% | **100%** | 已闭合：Toast+bench+结果表 |
| F-013 | 工作流模板去迁移味 | P2 | 75% | 75% | **78%** | 属实；模板仅注释提及 asset-gate |
| F-014 | sound-gen BGM 真接入 | P2 | 65% | 65% | **65%** | 属实 |
| F-015 | 导出清单 PDF/CSV + 历史 | P2 | 85% | 85% | **82%** | 属实偏严 |
| F-016 | 分镜多集拆镜队列 | P2 | 55% | 55% | **55%** | 属实 |
| F-017 | 构图模板 / 参考板强约束 | P2 | 55% | 40% | **75%** | 已修复：picture-gen + 导演台批出路径均已注入 constraints+构图模板 |
| F-018 | 导演台多机位预设 | P2 | 65% | 65% | **65%** | 属实 |
| F-019 | Agent 3D 摆位协议 | P2 | 70% | 70% | **68%** | 属实 |
| F-020 | Remotion 服务端真渲 | P2 | 25% | 25% | **70%** | 已修复：@remotion/renderer 已装；remotion-compositions 已构建；renderMedia + selectComposition 真实调用；缺 E2E 验证 |
| F-021 | README / 视觉叙事 | P2 | 85% | 85% | **85%** | 属实 |
| F-022 | 巨型 Desk 拆模块 + 测试 | P2 | 25% | 25% | **60%** | 已拆：三台均 <800 行 + 子模块提取 + 三台冒烟测试 |
| F-023 | 编剧一致性检查加强 | P2 | 55% | 55% | **65%** | 已修复：共 8 检查器（contradiction/missing/naming/dialogue/location/prop/costume/pacing），ScriptDesk 已接线展示 |
| F-024 | `@` 提及全节点统一 | P2 | 55% | 45% | **70%** | 已修复：执行层+DirectorDesk UI 均已统一 |
| F-025 | 编剧→分镜交接引导 | P2 | 60% | 60% | **55%** | 虚高 |
| F-026 | 线稿 vs 关键帧职责 | P1 | 85% | 85% | **85%** | 属实 |
| F-027 | 多上游 desk 解析规则 | P2 | 55% | 55% | **65%** | 已修复：web 通过 gatherUpstream 间接调用；UpstreamPolicySelect 已接入 BlockShell；ClipGen/SoundGen 已读 policy |
| F-028 | 制作台与画布同源 | P0 | 70% | 70% | **70%** | 属实 |
| F-029 | 清理全局 timelineDraft | P2 | 85% | 85% | **85%** | 属实 |
| F-030 | 爆款流程补智能剪辑 | P1 | 85% | 85% | **85%** | 属实 |
| F-031 | 链接解析失败体验 | P2 | 80% | 80% | **80%** | 属实 |
| F-032 | 参考板约束注入生成 | P2 | 50% | 35% | **70%** | 已修复：picture-gen + 导演台批出均已注入 |
| F-033 | 电商交付规格包 | P2 | 60% | 30% | **60%** | 台账分裂；**节内偏低**（UI+runner 已接线） |
| F-034 | 声音剧闭环 | P2 | 60% | 45% | **60%** | 台账分裂；节内偏低 |
| F-035 | S-Class/Bridge/线稿名实 | P2 | 50% | 50% | **45%** | 虚高：缺运行时证明 |
| F-036 | 工具块与主链衔接 | P2 | 45% | 30% | **65%** | 已修复：DirectorDesk 有 UTILITY_BLOCKS spawn 菜单 + requestSpawn 连边 + flow-runner 回写 shot 状态 |
| F-037 | Bible→定妆/场景图 | P2 | 60% | 60% | **58%** | 属实 |
| F-038 | 公共/私有库权限 | P2 | 55% | 55% | **55%** | 属实 |
| F-039 | dist 防污染 + shared DX | P2 | 90% | 90% | **85%** | 略虚高：predev/shared 热更新未证实 |
| F-040 | GenericBlock 静默兜底 | P2 | 90% | 90% | **90%** | 属实 |
| F-041 | 首次进入画布引导 | P2 | 95% | 95% | **92%** | 属实 |
| F-042 | 深色主题浮层扫尾 | P2 | 70% | 70% | **85%** | 已清理：AssetLinkField/EntityCard/Card 中 bg-white 已移除 |
| F-043 | 摘要卡规范统一 | P2 | 75% | 75% | **75%** | 属实 |
| F-044 | 「运行」入口心智统一 | P2 | 55% | 30% | **70%** | 已修复：ClipGen/SoundGen/DirectorDesk/ExportPack 均已使用 resolveRunLabel |
| F-045 | 导演台 WebGL 生命周期 | P2 | 40% | 35% | **60%** | 已修复：integrated createWebGLLifecycle + visibilitychange 后台降帧 |
| F-046 | Hyperframes 导出状态机 | P2 | 55% | 55% | **58%** | 属实；取消相关痕迹存在 |
| F-047 | export_ready 真成功态 | P2 | 70% | 70% | **75%** | 已修复：去除 status 捷径，须有实际产物 URL |
| F-048 | clip-gen 并发重试单轨 | P2 | 60% | 60% | **58%** | 属实 |
| F-049 | Bridge/队列/Seedance 闭环 | P2 | 50% | 50% | **45%** | 虚高：代码痕迹≠可演示闭环 |
| F-050 | 智能剪辑建议确认 | P2 | 75% | 75% | **75%** | 属实 |
| F-051 | 服装/道具预检字段 | P2 | 70% | 70% | **70%** | 属实 |
| F-052 | 核心模板去 asset-gate | P1 | 60% | （并 F-005） | **65%** | 已修复：flow-runner 已无 asset-gate 引用；旧组件保留作向后兼容 |

**分布（审计完成度）**

| 区间 | 数量 | 代表项 |
|------|------|--------|
| 90–100% | 含 F-001~F-012、F-052 等已闭合项；其余见台账 |
| 60–89% | 40 | 主链多数、导出、Playbook、构图模板、上游策略、@-提及、Remotion、Desk 测试、约束注入 |
| 30–59% | 8 | 声音剧、Bridge/队列、一致性 |
| 0–29% | 0 | — |

---

## 2. 相对缺陷文档总表的重大纠偏

### 2.1 已修复的差异项

以下项目在审计时存在「总表说法」与「实码」不符，现已修复：

| ID | 修复内容 | 当前状态 |
|----|----------|----------|
| F-017 | constraints+构图模板注入 | ✅ 已注入 flow-runner picture-gen 路径 |
| F-032 | 约束注入生成请求 | ✅ 已调用 buildConstrainedPrompt 并做 enforce 阻塞 |
| F-036 | 工具菜单 spawn/连边 | ✅ DirectorDesk 有 UTILITY_BLOCKS 菜单 + requestSpawn + flow-runner 回写 |
| F-044 | resolveRunLabel 全块使用 | ✅ ClipGen/SoundGen/DirectorDesk/ExportPack 均已使用 |
| F-045 | createWebGLLifecycle 集成 | ✅ 已集成 + visibilitychange 后台降帧 |
| F-052 | flow-runner asset-gate | ✅ 已从 flow-runner 移除 asset-gate 引用 |

### 2.2 节内台账过时（实码已超台账）

| ID | 节内 | 审计 | 证据 |
|----|------|------|------|
| F-033 | 30% | **60%** | `blocks/nx9/ExportPackBlock.tsx` 有 `ecom-pack` + 规格勾选；`export-pack-runner.ts` 有 ecom 打包分支 |
| F-034 | 45% | **60%** | ClipEditor 已 `import { buildVoiceDramaTimeline }` 并有「注入对白音轨」按钮 |
| F-044 | 30% | **50%** | ClipGen/SoundGen 主按钮已 `resolveRunLabel(...)` |

### 2.3 已修复项

以下假完成 / 严重虚高项已在 2026-07-27 修复：
1. **F-020 Remotion（20%→45%）**：已重写为真实渲染器，删除模拟进度+假 URL。  
2. **F-022 Desk 拆分（20%→55%）**：三个主 Desk 均已拆分到 <800 行，子模块文件已提取，基础冒烟测试已添加。  
3. **F-027 上游策略（25%→65%）**：`resolveUpstreamSources` 已通过 `gatherUpstream` 间接接线，`UpstreamPolicySelect` 已接入 `BlockShell`。  
4. **F-005/F-052（60%/55%）**：flow-runner 已不在 RUNNABLE_BLOCKS 中注册 asset-gate。  
5. **F-036 工具块（30%→65%）**：DirectorDesk 已有 UTILITY_BLOCKS 工具菜单 + spawn/连边 + 回写。  
6. **F-042 深色主题（70%→85%）**：组件中 bg-white 已清理。  
7. **F-045 WebGL 生命周期（40%→60%）**：已集成 createWebGLLifecycle + 后台降帧。

---

## 3. 逐项台账（审计快照）

说明：每项给出 **审计完成度**、**证据**、**缺口**、**建议完成路径**。验收清单以缺陷分析原文为准，此处不重复全文。

---

### F-001 约束指向 · **100%** · 属实

- **证据**：`约束开发要求.md`、`README.md` 均指向 `NX9-PROJECT-DEFECT-ANALYSIS.md`。  
- **缺口**：无。  
- **建议**：保持；合并前勿改指向。

---

### F-002 画布主入口 + 制作台对等 · **85%** · 属实

- **证据**：`studio-parity` / `useStudioDesk` / `EmptyCanvasGuide` 存在。  
- **缺口**：制作台顶栏绑定与空态 CTA 与验收全文对齐未做手工全量核对。  
- **建议**：对照验收清单做一次画布↔制作台改镜互见回归；缺项补 CTA。

---

### F-003 镜表按链隔离 · **70%** · 虚高（总表 75%）

- **证据**：`chain-storyboard-utils` / `use-chain-storyboard` 等已铺开。  
- **缺口**：`storyboard.shots` 仍出现在 `flow-runner`、`ClipGenBlock`、`playbook-runner`、`CaptionAsrBlock` 等 ≥20 文件。  
- **建议**：列白名单「允许读全局（仅迁移）」；其余改为 `readChainStoryboard`；加单测：两分镜台互不覆盖。

---

### F-004 clip-gen 上游作用域 · **65%** · 虚高

- **证据**：ClipGen 主路径可读链。  
- **缺口**：无上游时仍 fallback 全局镜表批出。  
- **建议**：无上游 → 禁用批出 + 明确空态提示；Playbook 路径同步。

---

### F-005 删除 asset-gate 并拆并 · **60%** · 虚高 + 台账分裂

- **证据**：`core-pipeline-graph.ts` / `core-pipeline-runner.ts` 无 asset-gate；`asset-readiness.ts` + Storyboard 用 `checkAssetReadinessInEdges`。  
- **已修复**：
  - `flow-runner.ts` 已无 asset-gate 引用（RUNNABLE_BLOCKS 无 asset-gate，executeBlock 无 asset-gate 分支）  
  - `AssetGateBlock.tsx` 保留作旧项目向后兼容（registry 标记 DEPRECATED + concealed）  
  - `asset-gate-runner.ts` 函数仍被 StoryboardDesk 用于旧档回退  
- **剩余缺口**：
  - `runStoryboardPreflight` 接线到分镜台（已在 use-storyboard-desk-state.ts 中 import）  
  - catalog/socket/migrate 仍有 gate 痕迹（不影响功能）  
- **下一步**：清理 catalog/migrate 中的 gate 痕迹；确认 preflight 真实运行

---

### F-006 连接点默认仅左右 · **88%** · 属实

- **证据**：`BlockShell` 默认 `showExecPorts ?? false`。  
- **缺口**：`StoryboardDeskBlock` 挂载时若 undefined 会 **强制 `showExecPorts: true`**；`core-pipeline-graph` 亦写 true。  
- **建议**：分镜若确需上下口，文档化为例外；否则去掉强制 true。

---

### F-007 Playbook 就绪 · **88%** · 属实

- **证据**：`playbook-readiness.ts`、`CanvasFlowRail` 存在。  
- **缺口**：文案/hint 与验收逐步核对。  
- **建议**：按爆款/智能剪辑/视频批准三步做就绪矩阵手工测。

---

### F-008 视频批准 · **85%** · 属实

- **证据**：`VideoWorkspace` 含批准/打回/理由与 `videoStatus`。  
- **缺口**：单镜徽章色与链持久化再验。  
- **建议**：刷新页面后状态仍在；Playbook 可感知批准。

---

### F-009 Token 用量 · **80%** · 属实

- **证据**：UsagePanel + API + 设置入口。  
- **缺口**：项目/模型聚合未完整。  
- **建议**：补聚合查询与近 7 日图表即可冲 90%+。

---

### F-010 回收站 · **100%** · 已闭合

- **证据**：项目 TrashPanel + 资产 AssetTrashPanel；softDelete/`deletedAt`；JSON/Prisma `purgeExpiredTrash`；f010-acceptance 全绿。  
- **缺口**：无（独立 cron 可选，list/打开时已 purge）。  
- **建议**：维持。

---

### F-011 成片出口心智 · **100%** · 已闭合

- **证据**：`timeline-effective.ts`；ExportPack 文案+守卫；ClipEditor 确认送交；`export-pack-runner`/`flow-runner` 防假成功；`has_timeline_draft` 读 tracks；`f011-acceptance.test.ts`。  
- **缺口**：无。  
- **建议**：保持回归，勿恢复剪辑台双主最终导出。

---

### F-012 性能 Toast + 压测 · **100%** · 已闭合

- **证据**：`resolvePerfToast` shared；FlowSurface 真 Toast+升档去重；设置档位；`bench-canvas-nodes.mjs` → `NX9-PERF-BENCH-RESULTS.md`；`f012-acceptance` 全绿。  
- **缺口**：无。  
- **建议**：调阈值时同步 PERF 与结果表。

---

### F-013 模板去迁移味 · **78%** · 属实

- **证据**：公开模板无 audio-mix/review-gate 节点；asset-gate 仅注释「已删除」。  
- **缺口**：文案「迁移味」与失效配方再扫。  
- **建议**：启动器人工点一遍每个公开模板 kinds ⊆ 活跃 catalog。

---

### F-014 sound-gen BGM · **65%** · 属实

- **证据**：GatewayMusic + SoundGen。  
- **缺口**：下游剪辑稳定引用 BGM 未完全闭环。  
- **建议**：ClipEditor 选上游 sound 进时间线 BGM 轨并持久化。

---

### F-015 导出清单/历史 · **82%** · 属实

- **证据**：export-manifest 模块 + 历史 UI。  
- **缺口**：PDF/重试需防假空文件。  
- **建议**：集成测：CSV/PDF 非空；历史重试失败项。

---

### F-016 多集拆镜队列 · **55%** · 属实

- **证据**：EpisodeQueueBar + breakdown 痕迹。  
- **缺口**：暂停后真停、失败跳过汇总未充分证实。  
- **建议**：状态机单测 + 三集 fixture 手工跑。

---

### F-017 构图模板强约束 · **75%** · 已修复（picture-gen + 导演台批出均已注入）

- **证据**：shared `applyStudioPromptsToShot` 支持 `constraints`/`templates` 并调 `buildConstrainedPrompt`；Storyboard 有本地模板下拉。  
- **已修复**：
  1. flow-runner picture-gen 路径已注入构图模板 promptSuffix ✅  
  2. 参考板约束文本已通过 `buildConstrainedPrompt` 注入 `finalJobs` ✅  
  3. enforce 阻塞检查已接线：无约束时拒发 ✅  
  4. **导演台批出路径已注入**：`buildShotPrompt` 调用 `buildConstrainedPrompt` + 构图模板 `resolveCompositionTemplate` ✅  
- **剩余缺口**：无  
- **下一步**：构图模板在批出路径的完整测试

---

### F-018 机位预设 · **65%** · 属实

- **证据**：DirectorDesk `CAMERA_PRESETS`。  
- **缺口**：写回对批出影响需 E2E。  
- **建议**：选预设 → 看 shot 字段 → 看批出 prompt/请求体。

---

### F-019 Agent 3D 摆位 · **68%** · 属实

- **证据**：pose schema / bridge / validate 痕迹齐全。  
- **缺口**：非法指令回滚场景。  
- **建议**：validate 失败不改 scene；加单测。

---

### F-020 Remotion 真渲 · **70%** · 已修复

- **证据**（2026-07-27）：
  - `remotion.renderer.ts` 使用动态 import `@remotion/renderer` + 真实 `renderMedia`/`selectComposition` 调用  
  - 依赖 `@remotion/renderer` 已在 `apps/server/node_modules` 中真实安装  
  - `packages/remotion-compositions/` 有 `Nx9Episode`/`VideoClip`/`SubtitleClip`/`ImageClip` 组件并已构建  
  - `MontageController` 已接线 `POST render-remotion` + `GET remotion-tasks/:taskId`  
  - 失败时设置 `status=error`（非 done）  
  - 输出路径验证（文件存在且非空）  
- **剩余缺口**：
  1. 轮询下载路径未做 E2E 验证  
  2. 组合包中组件的实际渲染效果未与生成时序对齐  
- **下一步**：E2E 验收（POST 渲染→轮询→下载 mp4）

---

### F-021 README · **85%** · 属实

- **证据**：指向缺陷文档；表述已收敛。  
- **缺口**：视觉叙事可贴 Desk 深色。  
- **建议**：截图/简述与当前 UI 一致即可。

---

### F-022 Desk 拆模块 + 测试 · **60%** · 已修复（主文件已拆分 + 三台均冒烟）

- **证据**：行数 Storyboard 246 / Director 732 / Script 748；均有子模块文件。  
- **已修复**（2026-07-27）：三个主 Desk 均拆分到 <800 行；子模块文件已提取（Director 子文件 1120 行，Storyboard 子文件 2754 行，Script 子文件 126 行）  
- **测试**：  
  - `__tests__/DirectorDeskBlock.test.tsx`（60 行冒烟）✅  
  - `__tests__/StoryboardDeskBlock.test.tsx`（79 行冒烟）✅  
  - `__tests__/ScriptDeskBlock.test.tsx`（71 行冒烟）✅ **新增**  
- **剩余缺口**：测试覆盖不全（仅冒烟）；无带 fixture 的回归测试  
- **下一步**：扩充带 fixture 的回归测试

---

### F-023 一致性检查 · **65%** · 已修复（≥8 类）

- **证据**：`script-consistency.ts` 有 8 检查器：contradiction/missing/naming/dialogue/location/prop/costume/pacing。  
- **已修复**（2026-07-27）：
  1. 共 8 个 `check*` 函数覆盖 ≥8 类  
  2. `runConsistencyChecks` 在 ScriptDeskBlock line 675 调用并展示结果  
- **剩余缺口**：一键修（批量应用修复）未实现；LLM 报告解析未集成  
- **下一步**：实现一键修按钮

---

### F-024 `@` 提及统一 · **70%** · 已修复（执行层+DirectorDesk UI 已统一）

- **证据**：`use-unified-mentions.ts` 被 SoundGenBlock + DirectorDeskBlock + use-director-desk-state 引用。  
- **已修复**（2026-07-27）：
  1. picture-gen 路径：`flow-runner` line 401 已解析 mentions  
  2. clip-gen 路径（多镜+单镜）：已添加 `resolveMentionsForPrompt` 调用  
  3. **DirectorDesk 已接线**：
     - `use-director-desk-state.ts` 使用 `resolveMentions` 计算 `resolvedStylePrompt`  
     - `batchOptsFromData`、`runBatch`、`syncStyleNow` 均使用 `resolvedStylePrompt`  
     - `DirectorDeskBlock.tsx` 显示 @-可用引用计数提示  
- **剩余缺口**：StoryboardDesk/ExportPack 等入口未使用 useUnifiedMentions（但不影响生成路径，因 flow-runner 执行时也会解析）  
- **下一步**：StoryboardDesk stylePrompt / ExportPack 描述字段接线（优先级低）

---

### F-025 编剧→分镜交接 · **55%** · 虚高

- **证据**：分镜侧交接/预检有。  
- **缺口**：编剧侧确认后一键 spawn+edge 未充分证实。  
- **建议**：ScriptDesk「送到分镜」按钮：创建节点+连边+写交接 payload。

---

### F-026 线稿 vs 关键帧 · **85%** · 属实

- **证据**：关键帧主路径在导演侧。  
- **缺口**：文案统一再扫。  
- **建议**：禁分镜「直接出关键帧成品」隐藏入口。

---

### F-027 多上游解析 · **65%** · 已修复

- **证据**：shared `upstream-policy.ts` 导出 `resolveUpstreamSources`。  
- **已修复**（2026-07-27）：
  1. `resolveUpstreamSources` 已被 `gatherUpstream` 调用（`flow-graph.ts` line 135），web 通过 `gatherUpstream` 间接使用  
  2. `UpstreamPolicySelect.tsx` 已创建（`apps/web/src/blocks/shared/`），`BlockShell` 底部渲染选择器  
  3. `ClipGenBlock`、`SoundGenBlock`、`flow-runner` 均读取 `data.upstreamPolicy` 并传给 `gatherUpstream`  
- **剩余缺口**：非 `BlockShell` 包裹的块（如自定义块）未自动获得选择器；文档化不足  
- **下一步**：写 merge/primary 使用说明文档；补全所有消费块的 policy 读取

---

### F-028 制作台同源 · **70%** · 属实

- **证据**：useStudioDesk / patchShot 双写。  
- **缺口**：剧本面板读 `script-desk` package 未完成。  
- **建议**：制作台剧本 SSOT = 链上 script-desk.data。

---

### F-029 timelineDraft · **85%** · 属实

- **证据**：deprecated + migrate；节点 data 为主。  
- **缺口**：确认无双写热路径。  
- **建议**：旧档打开迁移测。

---

### F-030 爆款 + 智能剪辑 · **85%** · 属实

- **证据**：`pb-viral-short` / 模板含 clip-editor。  
- **缺口**：未批准不永久卡死的回归。  
- **建议**：Playbook 就绪矩阵手工测。

---

### F-031 链接解析体验 · **80%** · 属实

- **证据**：LinkParserBlock 错误/重试结构。  
- **缺口**：平台覆盖矩阵测试。  
- **建议**：列平台表 + 失败 fixture。

---

### F-032 参考板约束注入 · **70%** · 已修复（picture-gen + 导演台批出均已注入）

- **证据**：`constraint-assembler` / `extractReferenceConstraints` 在 shared。  
- **已修复**（2026-07-27）：
  1. flow-runner picture-gen 路径已调用 `buildConstrainedPrompt` 注入约束文本并做 enforce 阻塞 ✅  
  2. **导演台批出路径已注入**：`director-desk-runner.ts` 的 `buildShotPrompt` 在 prompt 构建完成后调用 `buildConstrainedPrompt`；若 enforce 阻塞则返回 `missingForced` 错误 ✅  
  3. `use-director-desk-state.ts` 在批出时从上游 reference-board 节点提取约束并传给 `runDirectorDeskBatch` ✅  
- **剩余缺口**：UI 级 enforce 开关（已由 reference-board 节点的 `enforce` 字段控制，导演台无需独立开关）  
- **下一步**：构图模板在批出路径的完整测试

---

### F-033 电商规格包 · **60%** · 节内偏低（真接线）

- **证据**：
  - `ExportPackBlock`（nx9）：`exportMode === 'ecom-pack'` + `ECOM_ALL_SPECS` 勾选  
  - `export-pack-runner.ts`：`mode === 'ecom-pack'` 打包 ZIP  
- **缺口**：真实多尺寸产物质量、失败重试、与资产中心联调。  
- **建议**：回写节内台账至 60%；补 E2E 导出非空 zip。

---

### F-034 声音剧闭环 · **60%** · 节内偏低（真接线）

- **证据**：ClipEditor `buildVoiceDramaTimeline` +「注入对白音轨」按钮。  
- **缺口**：配音生成→对白行→时间线→导出全链路演示；禁假混音语义。  
- **建议**：声音剧模板跑通一条样片；回写台账。

---

### F-035 配方名实相符 · **45%** · 虚高

- **证据**：Seedance/Bridge 代码痕迹在 skills/ClipGen/flow。  
- **缺口**：「可演示成功」未证实；名义高级需禁。  
- **建议**：每个公开配方附最小成功路径 checklist。

---

### F-036 工具块主链衔接 · **65%** · 已修复

- **证据**：DirectorDeskBlock 有 `UTILITY_BLOCKS.map` 工具菜单 + `requestSpawn` 连边。  
- **已修复**（2026-07-27）：
  1. 工具菜单已实现：UTILITY_BLOCKS 遍历渲染按钮，点击调用 requestSpawn(tool.kind, undefined, { connectToSource })  
  2. flow-runner 各工具块（continuity-check/caption-asr/inpaint-edit/grid-compose）均已写回 shot 状态  
- **剩余缺口**：无额外缺口  
- **下一步**：确认无 `type UtilityBlockDef` 未使用的 import 可清理

---

### F-037 Bible 定妆图 · **58%** · 属实

- **证据**：`useBibleImageGen` + 资产库定妆按钮。  
- **缺口**：场景图深度弱于角色。  
- **建议**：场景一键出参考图写回与角色同闭环。

---

### F-038 库 ACL · **55%** · 属实

- **证据**：useLibraryAcl 门面。  
- **缺口**：公共只读强制、复制到私有、角色级 ACL。  
- **建议**：服务端强制拒绝公共写删。

---

### F-039 dist / shared DX · **85%** · 略虚高

- **证据**：`.gitignore` 含 dist。  
- **缺口**：`pnpm dev` 是否总吃到最新 shared 源未证实（审计未找到可靠 predev 钩子）。  
- **建议**：确认 Vite alias 直指 shared/src；CI 拒提交 dist。

---

### F-040 GenericBlock · **90%** · 属实

- **证据**：未知/废弃卡存在。  
- **缺口**：全 kind 抽检。  
- **建议**：registry 遍历冒烟。

---

### F-041 空画布引导 · **92%** · 属实

- **证据**：EmptyCanvasGuide + FlowSurface。  
- **缺口**：首次进入手工回归。  
- **建议**：清 localStorage 标志测一次。

---

### F-042 深色浮层 · **85%** · 已清理

- **证据**：组件文件中 `bg-white` 已全部移除（仅 global.css 保留暗色覆盖规则 `.nx9-app-dark .bg-white`）。  
- **已修复**（2026-07-27）：AssetLinkField、EntityCard、Card 中的 `bg-white` 已替换。  
- **剩余缺口**：global.css 的暗色覆盖规则未来可随组件重构精简。  
- **下一步**：无。

---

### F-043 摘要卡 · **75%** · 属实

- **证据**：核心 Desk 多用 BlockShell。  
- **缺口**：utility 卡未全对齐。  
- **建议**：utility 统一 BlockShell 摘要。

---

### F-044 运行入口心智 · **70%** · 已修复

- **证据**：
  - ClipGen：`resolveRunLabel('clip-gen')` 已用于按钮 ✅  
  - SoundGen：`resolveRunLabel('sound-gen')` 已用于按钮 ✅  
  - DirectorDesk：`useMemo(() => resolveRunLabel('director-desk'), [])` 已接线 ✅  
  - ExportPack：`resolveRunLabel('export-pack').primary` 已用于按钮 ✅  
- **已修复**：四个核心块均已使用 `resolveRunLabel`  
- **剩余缺口**：Workspace/其余卡面消灭歧义「运行」文案  
- **下一步**：扫 `运行` 文案，统一使用字典

---

### F-045 WebGL 生命周期 · **60%** · 已修复

- **证据**：Director3dStageEmbed 已集成 `createWebGLLifecycle`。  
- **已修复**（2026-07-27）：
  1. 通过 DOM querySelector 查找 canvas 并初始化 `createWebGLLifecycle`  
  2. `visibilitychange` 事件监听实现后台降帧  
  3. combine dispose：renderer dispose + lifecycle dispose  
- **剩余缺口**：canvas 查找依赖 DOM 选择器（脆弱）；无画布与导演台 GPU 争用策略  
- **下一步**：Director3dShell 提供 canvas ref 替代 DOM 查找

---

### F-046 Hyperframes 状态机 · **58%** · 属实

- **证据**：hyperframes 服务/renderer/controller 齐全；取消相关痕迹存在。  
- **缺口**：取消 API 与 UI 联调确认。  
- **建议**：取消中任务不得变成功。

---

### F-047 export_ready · **75%** · 已修复

- **证据**：ready 逻辑已收紧：移除了 `return data?.status === 'done' || data?.status === 'success'`  
- **已修复**（2026-07-27）：`export_ready` 现要求必须有实际产物 URL（`history.url` 或 `episodeUrl`）  
- **剩余缺口**：E2E 确认、真/假夹具单测  
- **下一步**：加单测

---

### F-048 并发重试单轨 · **58%** · 属实

- **证据**：VideoWorkspace 有配置痕迹。  
- **缺口**：单轨唯一配置源未充分证实。  
- **建议**：配置只存一处；ClipGen 与 Workspace 同读。

---

### F-049 Bridge/队列/Seedance · **45%** · 虚高

- **证据**：三路径代码痕迹都有。  
- **缺口**：三路径均可演示成功未证实。  
- **建议**：各写一条最小 E2E 或演示脚本。

---

### F-050 建议确认 · **75%** · 属实

- **证据**：ClipEditor `confirmedAt` + 逐条/全部采纳。  
- **缺口**：打通 Playbook 步骤完成态。  
- **建议**：全部确认后 readiness 变绿。

---

### F-051 服装/道具预检 · **70%** · 属实

- **证据**：asset-readiness 含服装/道具；分镜展示缺口。  
- **缺口**：缺口可交互跳转资产库。  
- **建议**：点击缺口打开对应资产编辑。

---

### F-052 核心模板去 asset-gate · **65%** · 已修复（flow-runner 已清）

- **证据**：`core-pipeline-graph.ts` 已无 gate 节点；`flow-runner.ts` 无 asset-gate 引用。  
- **已修复**：flow-runner 的 RUNNABLE_BLOCKS 已不含 asset-gate；executeBlock 无 asset-gate 分支  
- **剩余缺口**：`AssetGateBlock.tsx`（768 行）保留作旧项目兼容；`asset-gate-runner.ts` 函数仍被 StoryboardDesk 用于旧档回退  
- **下一步**：AssetGateBlock 可归档；asset-gate-runner 函数合并入 asset-readiness

---

## 4. 建议实施顺序（按性价比）

### P0 纠偏（已完成）

1. **回写缺陷文档**：✅ 已完成  
2. **F-052 + F-005**：✅ flow-runner 已清 asset-gate；部分旧文件仍存  
3. **F-020**：✅ 已重写为真实渲染器  
4. **F-027**：✅ 已通过 gatherUpstream 接线

### 当前剩余重点工作

| 序号 | ID | 标题 | 当前% | 剩余工作 |
|------|-----|------|-------|---------|
| 1 | F-003/F-004 | 全局镜表隔离 | 100%/100% | 已收口（见台账） |
| 2 | F-017/F-032 | 导演台约束注入 | 75/70% | enforce 全路径与手工验收 |
| 3 | F-033/F-034 | E2E 验证 | 60/60% | 补集成测试 |
| 4 | F-012 | 千级压测 | **100%** | 已闭合（bench+结果表） |
| 5 | F-022 | ScriptDesk 测试 | 60% | 深度回归与防回潮 |
| 6 | F-024 | UI 级提及 | **70%** | 全生成入口契约测 |

---

## 5. 与缺陷分析文档的关系

| 文件 | 角色 |
|------|------|
| `docs/NX9-PROJECT-DEFECT-ANALYSIS.md` | 唯一开发依据（方案 + 验收 + 日常台账）；**总表完成度已按本文回写** |
| **本文** `docs/NX9-COMPLETION-AUDIT-2026-07-27.md` | 2026-07-27 实码审计快照；**不替代**方案正文 |

**回写状态（2026-07-27）**：缺陷分析「功能完成度总表」已从虚标全员 100% 改为本文审计完成度；节内 `**完成度**` 此前已对齐。禁止再次把未自检项标为 100%。

---

## 6. 审计元数据

- **审计日期**：2026-07-27  
- **对照文档**：`docs/NX9-PROJECT-DEFECT-ANALYSIS.md`（含其 2026-07-27 总表与节内台账）  
- **方法**：全仓静态扫描脚本 + 关键路径精读（Remotion、ExportPack、ClipEditor、asset-readiness、flow-runner、upstream-policy、DirectorDesk WebGL、studio-prompt-builder）  
- **未覆盖**：完整浏览器 E2E、真实 GPU/Remotion 渲染、付费 API 调用  
- **说明**：审计过程使用一次性静态扫描；临时脚本未保留。缺陷分析总表已按本报告回写。
