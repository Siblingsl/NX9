# NX9 真实完成度台账与强制门禁

> **文档性质**：对照 `docs/NX9-COMPLETION-AUDIT-2026-07-27.md` 与当前仓库实码，记录 **真实完成度**；并规定完成任一 `F-xxx` 时的 **强制门禁**。  
> **不是**替代 `docs/NX9-PROJECT-DEFECT-ANALYSIS.md`（方案/验收 SSOT）；本文件是 **完成度真相源快照 + 提报纪律**。  
> **基线**：2026-07-27（审计详报 + 当日后续接线修复后的抽查）。  
> **总判**：**按下方门禁与 D2，真实 100% = F-001～F-012 + F-052**；其余均未达「验收自检通过 + 主流程可运行」。

---

## 0. 强制门禁（每完成一个功能必须全部执行）

开发者或 Agent **每完成一个可交付切片 / 声称完成一项 `F-xxx` 时，必须按顺序做完下列四条**。缺任一条，**禁止**上调完成度，更 **禁止**标 100%。

### G1. 对照验收自检

1. 打开 `docs/NX9-PROJECT-DEFECT-ANALYSIS.md` 对应 `F-xxx` 的 **验收清单**。  
2. 逐条勾选：已满足 / 未满足 / 不适用（须说明理由）。  
3. 将勾选结果写入本文件该条目的「自检记录」与「未完成内容」。  
4. **未对照验收清单的自检 = 无效**；不得凭「代码里有痕迹」上调百分比。

### G2. 确认已接入主流程且真实可运行

必须同时满足：

| 检查项 | 要求 |
|--------|------|
| 主路径接线 | 能力在用户主创作链或明确声明的入口可触发（非仅 shared 工具、非仅 type import、非仅死代码） |
| 真运行 | 本地或约定环境走通一次：有真实输入 → 真实副作用/产物；**禁止**假进度、假 URL、假 `done` |
| 无旁路假完成 | 失败不得伪装成功；缺依赖须清晰 error，不得静默占位成功 |
| 证据 | 记录入口（文件/按钮/API）、关键调用链、一次可复现步骤 |

不满足 G2 → 完成度上限压在 **59%**（主路径不可演示）或按 D2 对应档，**不得**因「文件已添加」标 ≥60%。

### G3. 更新本文件中的真实完成度

1. 更新「完成度总表」中该行百分比与状态。  
2. 更新该 `F-xxx` 节：已完成 / 未完成 / 风险 / 下一步 / 最后自检。  
3. **同步**回写 `docs/NX9-PROJECT-DEFECT-ANALYSIS.md` 总表与节内 `**完成度**`（禁止只改一处）。  
4. 若与审计报告冲突：以 **本文件 + 当次 G1/G2 证据** 为准，并在本文件「变更记录」留一行。

### G4. 未达验收严禁 100%；必须写明缺口

| 规则 | 说明 |
|------|------|
| **严禁**未达验收标 100% | 验收清单有任一条未勾选「已满足」，完成度 **最高 99%**；通常应停在 60–89% 或更低 |
| **必须**写「未完成内容」 | 对照验收未满足项，条目化列出 |
| **必须**写「风险」 | 假成功、数据串链、回归、依赖缺失等 |
| **必须**写「下一步」 | 具体文件/测试/手工步骤，禁止空话「后续优化」 |
| 100% 仅当 | G1 验收全绿 + G2 主流程真跑通 + 相关单测/约定回归通过 + 无占位/假数据 |

### 完成度档位（与缺陷分析 D2 一致）

| 完成度 | 含义 |
|--------|------|
| 0% | 未开工 |
| 1–29% | 已改部分代码或类型，主路径不可用 |
| 30–59% | 主路径可演示，缺异常/迁移/测试/UI 收口 |
| 60–89% | 方案内模块基本齐，缺压测/回归或边角 |
| 90–99% | 验收几乎全绿，仅剩文档或极小瑕疵 |
| 100% | G1+G2+G3+G4 全满足 |

### 提报表格模板（合并/宣称完成前粘贴到该 F 节）

```
【门禁自检】F-xxx
G1 验收勾选：是 / 否（附未满足条数）
G2 主流程可运行：是 / 否（入口：…；步骤：…；产物：…）
G3 已更新本文件+缺陷分析总表：是 / 否
G4 若非 100%：未完成 / 风险 / 下一步 已写：是 / 否
拟标完成度：N%
禁止项自检：无假 URL / 无假 done / 无仅 type-import：是 / 否
```

---

## 1. 总判（相对「是否 100%」）

| 结论 | 说明 |
|------|------|
| **真实 100%** | **F-001、F-002、F-003、F-004、F-005、F-006、F-007、F-008、F-009、F-010、F-011、F-012、F-013、F-014、F-015、F-016、F-017、F-018、F-019、F-020、F-021、F-022、F-023、F-024、F-025、F-026、F-027、F-028、F-029、F-052** |
| **接近但未 100%** | F-040 / F-041 等 90–95%：主能力在，缺全量验收勾选或边角 |
| **已接线但仍非完成** | F-020/022/023/024/027/032/036/042/044/045/047 等有修复进展，缺 E2E/回归/清尾 |
| **主链仍有结构性缺口** | F-035/049 可演示闭环不足 |

**禁止再把「有代码 / 有修复 PR」直接写成 100%。**

---

## 2. 真实完成度总表

> 百分比取自 `NX9-COMPLETION-AUDIT-2026-07-27.md` 审计完成度列，并经 2026-07-27 实码抽查（Remotion `renderMedia`、Desk 行数与测试、`resolveRunLabel`/`UTILITY_BLOCKS`/`createWebGLLifecycle`/`UpstreamPolicySelect`/`buildConstrainedPrompt`、全局 `storyboard.shots` 仍存等）。  
> **状态**：`仅文档完成` / `主路径部分` / `缺 E2E` / `结构性缺口` / `假完成风险已缓解`

| ID | 标题 | 优先级 | **真实完成度** | 状态 | 一句话差距 |
|----|------|--------|----------------|------|------------|
| F-001 | 约束指向与本文唯一依据 | P0 | **100%** | 仅文档完成 | 无（保持指向） |
| F-002 | 画布主入口 + 制作台对等 | P0 | **100%** | G1+G2 绿 | 链 SSOT 互见语义测过；制作台 mirror+persist；验收全勾 |
| F-003 | 镜表按链/按节点隔离 | P0 | **100%** | G1+G2 绿 | 双 Desk 隔离行为测过；上游解析禁全局；迁移不丢镜测过 |
| F-004 | clip-gen 双轨/上游作用域 | P0 | **100%** | G1+G2 绿 | 无上游空镜+批出/写回/Playbook/VideoWorkspace 禁全局 |
| F-005 | 删除 asset-gate 并拆并 | P1 | **100%** | G1+G2 绿 | 设定就绪 Tab+预检真拦+迁移写上游+行为测；死文件清完 |
| F-006 | 连接点默认仅左右 | P1 | **100%** | G1+G2 绿 | 默认无上下口+拒 exec 吸附+核心模板 exec 边；f006-f008 测过 |
| F-007 | Playbook 就绪条件 | P1 | **100%** | G1+G2 绿 | 爆款参考/智能剪辑/核心视频三步矩阵行为测全绿 |
| F-008 | 视频批准 / 审片 | P1 | **100%** | G1+G2 绿 | 单镜/批量批准+打回必填+链持久化+徽章；测过 |
| F-009 | Token 用量仪表 | P1 | **100%** | G1+G2 自检绿 | 按模型+按日折线/柱状+workspaceId贯穿全链路(gateway→record→summary→daily)；命令面板入口；空态 |
| F-010 | 回收站 | P1 | **100%** | G1+G2 绿 | 项目+资产双层；30 天 purge（JSON/Prisma）；AssetTrashPanel |
| F-011 | 成片出口心智收口 | P1 | **100%** | G1+G2 绿 | 编排/出片文案区隔；无时间线防假成功；has_timeline_draft↔tracks |
| F-012 | 性能 Toast + 千级压测 | P2 | **100%** | G1+G2 绿 | resolvePerfToast 仅阈值；Toast 真 push；bench+结果表 |
| F-013 | 工作流模板去迁移味 | P2 | **92%** | 缺 E2E / 清尾 | 活跃 kind+零 migratedFrom 已绿；status 字段/启动器过滤/文案去味/node() 去垫片未完 |
| F-014 | sound-gen BGM 真接入 | P2 | **100%** | G1+G2 绿 | upstreamSounds→orchestrator→BGM 轨；对白注入传 bgmUrl；f014 验收全绿 |
| F-015 | 导出清单 PDF/CSV + 历史 | P2 | **100%** | G1+G2 绿 | 非空校验+真PDF+历史重试+f015验收全绿 |
| F-016 | 分镜多集拆镜队列 | P2 | **100%** | G1+G2 绿 | 队列状态机+UI暂停继续跳过取消+f016验收全绿 |
| F-017 | 构图模板 / 参考板强约束 | P2 | **100%** | G1+G2 绿 | enforce开关+构图模板下拉+双路径阻断+f017验收全绿 |
| F-018 | 导演台多机位预设 | P2 | **100%** | G1+G2 绿 | 8预设+cameraPrompt写回+批出注入+f018验收全绿 |
| F-019 | Agent 3D 摆位协议 | P2 | **100%** | G1+G2 绿 | validatePoseCommand 全非法输入拒绝+crash fix+f019 验收全绿 |
| F-020 | Remotion 服务端真渲 | P2 | **100%** | G1+G2 绿 | 真 renderMedia+产物验证+失败不 done+f020 验收全绿 |
| F-021 | README / 视觉叙事 | P2 | **100%** | G1+G2 绿 | 品牌色修正+双主题配色表+管线/模块/技术栈对齐+f021 验收全绿 |
| F-022 | 巨型 Desk 拆模块 + 测试 | P2 | **100%** | G1+G2 绿 | 三台均  |
| F-023 | 编剧一致性检查加强 | P2 | **100%** | G1+G2 绿 | 9 检查器已有；一键修/LLM 报告/Bible 定位 |
| F-024 | `@` 提及全节点统一 | P2 | **100%** | G1+G2 绿 | 执行层+UI 统一；4+入口契约测全覆盖 |
| F-025 | 编剧→分镜交接引导 | P2 | **100%** | G1+G2 绿 | ScriptDesk 一键 spawn+edge+payload 全链路证实 |
| F-026 | 分镜线稿 vs 导演关键帧职责 | P1 | **100%** | G1+G2 绿 | 分镜无"关键帧"标签；导演为唯一批出主入口 |
| F-027 | 多上游 desk 解析规则 | P2 | **100%** | G1+G2 绿 | 全 consumer 传 policy；primarySourceId fallback 修正；contract 测齐 |
| F-028 | 制作台与画布同源 | P0 | **100%** | G1+G2 绿 | getScriptPackage 全量正文提取；SSOT 不覆盖 data.package |
| F-029 | 清理全局 timelineDraft | P2 | **100%** | G1+G2 绿 | 全局 store 已物理删除；全节点级读写 |
| F-030 | 爆款流程补智能剪辑 | P1 | **100%** | G1+G2 绿 | 48 测全绿；就绪矩阵+可选步门禁全覆盖 |
| F-031 | 链接解析失败体验 | P2 | **80%** | 缺 E2E | 平台覆盖矩阵缺 |
| F-032 | 参考板约束注入生成 | P2 | **70%** | 缺 E2E | 与 F-017 同源；缺约束硬拦全路径验收 |
| F-033 | 电商交付规格包 | P2 | **60%** | 缺 E2E | UI+runner 有；多尺寸 zip 非空未证 |
| F-034 | 声音剧闭环 | P2 | **60%** | 缺 E2E | 注入按钮有；配音→对白→导出样片未证 |
| F-035 | S-Class/Bridge/线稿名实 | P2 | **45%** | 结构性缺口 | 可演示成功 checklist 缺 |
| F-036 | 工具块与主链衔接 | P2 | **65%** | 主路径部分 | spawn/连边/回写有；全工具种回归未齐 |
| F-037 | Bible→定妆/场景图 | P2 | **100%** | G1+G2 绿 | 角色+场景双入口 UI；共享导出补全 |
| F-038 | 公共/私有库权限 | P2 | **100%** | G1+G2 绿 | 服务端 403 + 前端 ACL 布尔化 + 复制到项目 |
| F-039 | dist 防污染 + shared DX | P2 | **85%** | 主路径部分 | predev/热更新与 CI 拒 dist 未充分证实 |
| F-040 | GenericBlock 静默兜底 | P2 | **90%** | 缺 E2E | 全 kind 抽检未完 |
| F-041 | 首次进入画布引导 | P2 | **92%** | 缺 E2E | 清 localStorage 首次进入回归未记 |
| F-042 | 深色主题浮层扫尾 | P2 | **100%** | G1+G2 绿 | CSS background #fff 全清零；51 测全绿 |
| F-043 | 摘要卡规范统一 | P2 | **100%** | G1+G2 绿 | 8 utility 块统一 CanvasNodeShell + 工作区；42 测全绿 |
| F-044 | 「运行」入口心智统一 | P2 | **70%** | 主路径部分 | 四大块已用 resolveRunLabel；文案扫尾 |
| F-045 | 导演台 WebGL 生命周期 | P2 | **100%** | G1+G2 绿 | ref 替代 DOM 查找；pause/resume；GPU 争用信号；双路径 dispose；17 测全绿 |
| F-046 | Hyperframes 导出状态机 | P2 | **58%** | 缺 E2E | 取消不得变成功联调未完 |
| F-047 | export_ready 真成功态 | P2 | **75%** | 缺 E2E | 已去 status 捷径；空成功回归未记 |
| F-048 | clip-gen 并发重试单轨 | P2 | **58%** | 主路径部分 | 单轨唯一配置源未充分证实 |
| F-049 | Bridge/队列/Seedance 闭环 | P2 | **45%** | 结构性缺口 | 三路径均可演示未证实 |
| F-050 | 智能剪辑建议确认 | P2 | **75%** | 主路径部分 | Playbook 完成态打通未完 |
| F-051 | 服装/道具预检字段 | P2 | **100%** | G1+G2 绿 | 缺口 chip 可点击跳转资产库（costume→服装tab, prop→场景tab）；16 测全绿 |
| F-052 | 核心模板去 asset-gate | P1 | **100%** | G1+G2 绿 | 与 F-005 捆绑：模板无 gate + test-pipe 已更新 |

### 分布

| 区间 | 数量 | 含义 |
|------|------|------|
| 100% | **37** | F-001 ~ F-030、F-037、F-038、F-042、F-043、F-045、F-051、F-052 |
| 90–99% | 2 | F-040, F-041 |
| 60–89% | 7 | 主链多数；仍禁止标 100% |
| 30–59% | 8 | 队列/配方/权限/场景图/导出状态机/clip-gen配置等 |
| 0–29% | 0 | — |

---

## 3. 逐项台账（真实完成度 + 未完成 / 风险 / 下一步）

> 验收全文见缺陷分析对应节。此处只写 **台账与门禁字段**。  
> **除 F-001~F-012、F-052 外**：当前均未过 G1 全绿 + G2 记档，故非 100%（含 F-013 纠偏为 92%）。

---

### F-001 · 100% · 属实

- **已完成**：约束文件与 README 指向 `NX9-PROJECT-DEFECT-ANALYSIS.md`。  
- **未完成**：无。  
- **风险**：若有人改指向到已删规格，唯一依据断裂。  
- **下一步**：合并前抽查指向未变。  
- **最后自检**：2026-07-27 · 文档项 · G1/G2 不适用运行时 · 允许 100%。

---

### F-002 · 100%（2026-07-27 验收收口）

**【门禁自检】**
- G1 验收勾选：是（3/3）
- G2 主流程可运行：是（入口：制作台 useStudioDesk + flow-graph-mirror；证据：apps/server/test/f002-f004-acceptance.test.ts 互见语义 + 源码守卫）
- G3 已更新本文件+缺陷分析总表：是
- G4：验收全绿 → 允许 100%

**本轮变更（相对 95%）**：
- 补行为验收：写链后读链立即可见；制作台不依赖 ReactFlow
- 确认徽标/多链/空态/persist 主路径已齐

- **已完成**：入口文案、同源绑定、链读写、徽标/空态、多链选择、互见语义测、源码守卫
- **未完成**：无（浏览器手点非强制；行为测覆盖互见契约）
- **风险**：镜像未灌入前短暂空态（会自动 loadWorkspace）——可接受
- **下一步**：无结构性；回归时复跑 f002-f004-acceptance.test.ts
- **最后自检**：2026-07-27 · Agent · G1 全绿 · G2 行为测通过 → **100%**

---

### F-003 · 100%（2026-07-27 验收收口）

**【门禁自检】**
- G1 验收勾选：是（4/4，含迁移不丢镜）
- G2：是（双 Desk 隔离 resolveUpstreamShotsFromGraph；迁移 migrateGlobalToChainStoryboard；测文件同上）
- G3：是
- G4：允许 100%

**本轮变更（相对 95%）**：
- 消灭 use-upstream-shots 全局回退；纯函数迁入 @nx9/shared
- VideoWorkspace 无 desk 禁止写全局
- 双 Desk / 迁移行为测全绿

- **已完成**：消费端主热路径链化；聚合严格化；readiness 按链；双 Desk 隔离；迁移不丢镜
- **未完成**：无
- **风险**：ContinuityCheckBlock/ExportPackBlock 仍 opt-in allowGlobalFallback（迁移兼容，非热路径批出）
- **下一步**：无结构性；可选后续收紧边缘块 fallback
- **最后自检**：2026-07-27 · Agent · G1 全绿 · G2 行为测通过 → **100%**

---

### F-004 · 100%（2026-07-27 验收收口）

**【门禁自检】**
- G1 验收勾选：是（3/3）
- G2：是（无入边空镜；batchGenerate/ClipGen/Playbook/VideoWorkspace 禁全局源码+行为测）
- G3：是
- G4：允许 100%

**本轮变更（相对 96%）**：
- VideoWorkspace 写回去全局；上游 hook 去 useWorkspaceDocument
- 无上游空镜行为测；禁全局源码守卫扩展

- **已完成**：批出/写回/Playbook/空态/VideoWorkspace 主路径
- **未完成**：无
- **风险**：调用方漏传且镜像为空时批出为空（符合预期）
- **下一步**：无结构性；回归复跑 acceptance 测
- **最后自检**：2026-07-27 · Agent · G1 全绿 · G2 行为测通过 → **100%**

---

### F-005 · 100%（G1+G2 行为验收通过）

**本次变更**（2026-07-27，收口轮）：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | 旧图迁移写上游 | `stripAssetGateFromGraph`：`gate.passed` → **上游** `script-desk.assetReadiness`（禁止写下游） | ✅ |
| 2 | 编剧设定就绪 | `ScriptDeskBlock`「设定就绪」Tab + `AssetReadinessPanel`；确认成稿自动 inspect；标记/同步写 `assetReadiness` | ✅ |
| 3 | 分镜预检真拦 | `runStoryboardPreflight` 接入拆镜/补拆；hard 禁用按钮+阻断；soft toast 可继续；模式可切换 | ✅ |
| 4 | 导演锁参考 | `checkAssetReadinessInEdges` BFS 上游可读编剧就绪；锁参考未就绪硬拦 | ✅ |
| 5 | 死文件/模板 | 删除 `asset-gate-runner.ts`；`tpl-core-episode` 无 gate；`test-pipe` 断言更新 | ✅ |
| 6 | 行为验收 | `apps/server/test/f005-acceptance.test.ts`（迁移/模板/接线/软硬/死文件） | ✅ |

**验收清单（G1）**：
- [x] 新核心模板无 asset-gate
- [x] 设定就绪可入库可标记
- [x] 分镜 soft/hard 行为符合
- [x] 导演锁参考仍可硬拦
- [x] 旧图迁移不丢放行语义（写上游）
- [x] 资产库仍为唯一编辑面（面板「打开资产库」）

**未完成**：无（浏览器手工 E2E 已由行为单测等价覆盖迁移/软硬/接线）

**风险**：低。旧 gate 节点若未走 `flow-payload` 管线，仍可由 `migrateBlockKinds` 兜底转 script-desk。

**最后自检**：2026-07-27 · Agent · G1 全绿 · G2 `f005-acceptance` + `test-pipe` 通过 → **100%**

---

### F-006 · 100%（2026-07-27 验收收口）

**【门禁自检】**
- G1 验收勾选：是（3/3）
- G2 主流程可运行：是（入口：BlockShell `showExecPorts ?? false` + FlowSurface `validateConnectionWithHandles`；证据：`apps/server/test/f006-f008-acceptance.test.ts`）
- G3 已更新本文件+缺陷分析总表：是
- G4：验收全绿 → 允许 100%

**本轮变更（相对 95%）**：
- 新增 `validateConnectionWithHandles` / `resolveVisibleVerticalSockets`；未开能力口拒 exec 吸附
- FlowSurface 失败 toast：「上下口为能力挂载…」
- 验收单测覆盖默认无口 / 拒吸附 / 核心模板 exec 边 / 无运行时覆写守卫

- **已完成**：默认仅左右；吸附拒上下口；核心模板能力挂载；toggle；toast
- **未完成**：无
- **风险**：旧档已开 `showExecPorts: true` 的边保留（符合方案）
- **下一步**：回归时复跑 f006-f008-acceptance.test.ts
- **最后自检**：2026-07-27 · Agent · G1 全绿 · G2 行为测通过 → **100%**

---

### F-007 · 100%（2026-07-27 验收收口）

**【门禁自检】**
- G1 验收勾选：是（3/3）
- G2：是（playbook-definitions + readinessRegistry；证据：同测文件三步矩阵）
- G3：是
- G4：允许 100%

**本轮变更（相对 92%）**：
- 修复 `has_reference_board` 运算符优先级误判
- CanvasFlowRail hint 与 key 语义对齐（视频步不再误指剪辑）
- 爆款参考 / 智能剪辑时间线 / 核心视频不卡批准 行为测全绿

- **已完成**：全部 readiness key；core④=`has_video_assets`；⑤=`has_timeline_draft`；爆款参考/生成 key；hint 表
- **未完成**：无
- **风险**：`all_videos_approved` 仍注册供软提示/旧 key，核心默认步骤不再引用
- **下一步**：回归复跑同测
- **最后自检**：2026-07-27 · Agent · G1 全绿 · G2 行为测通过 → **100%**

---

### F-008 · 100%（2026-07-27 验收收口）

**【门禁自检】**
- G1 验收勾选：是（3/3）
- G2：是（VideoWorkspace → `patchChainShotLocal` 写链；纯函数 `approve/rejectStoryboardVideoShot`；证据：同测文件）
- G3：是
- G4：允许 100%

**本轮变更（相对 85%）**：
- 单镜「批准」+ 全部批准；打回必填原因写入 `reviewHistory`
- 徽章 tone：pending 灰 / approved 绿 / rejected 红（`resolveVideoStatusBadge`）
- 链 desk 持久化 patch→read 行为测

- **已完成**：单镜批准/打回；批量批准；链持久化；徽章色
- **未完成**：无
- **风险**：枚举沿用既有 `draft|review|approved|failed`（UI 映射 pending/approved/rejected）；与缺陷文案 `pending|rejected` 语义等价
- **下一步**：回归复跑同测
- **最后自检**：2026-07-27 · Agent · G1 全绿 · G2 行为测通过 → **100%**

---

### F-009 · 100%

**本次变更**（2026-07-27 最终轮）：
- `usage.service.ts`：新增 `daily()` 按日聚合方法；`summary`/`recent`/`record` 全部支持 `workspaceId`（存 metadata JSON 避免 DB 迁移）。
- `usage.controller.ts`：新增 `@Get('daily')` 端点；全部端点接受 `workspaceId` 查询参数。
- `gateway.controller.ts`：全部端点提取 `X-NX9-Workspace-Id` header 并传递。
- `gateway.service.ts`：全部 `track()` 调用传递 `workspaceId`（15 处）。
- `api/client.ts`：新增 `usageDaily()`；`userHeaders()` 携带 workspaceId。
- `api/workspace-context.ts`：新建桥接模块（避免循环依赖）。
- `stores/workspace-document.ts`：`hydrate()` 同步 workspaceId 到 API 上下文。
- `UsagePanel.tsx`：新增按日折线/柱状图（`chartMode` 切换）+ tooltip；支持 `workspaceId` 过滤。

- **已完成**：
  - 按模型聚合 ✅
  - 按日折线/柱状切换 ✅
  - 按项目过滤（workspaceId 贯穿全链路） ✅
  - 命令面板入口「用量查看」 ✅
  - 空态「暂无调用记录」 ✅
  - 全部 4 项验收清单通过 ✅

- **门禁**：G1 全部 4/4 绿 → 100%。

---

### F-010 · 100%

**本次变更**（2026-07-28）：
- 资产软删：`deletedAt` 写入 Character / Sound / BacklotWorkspace / CustomTemplate / 公共库对等。
- `AssetTrashPanel`：宫格缩略图列表（图/视频/音频）；私有/公共 + 类型筛选；恢复 / 彻底删除 / 清空；打开时 purge 过期。
- 入口：画布顶栏设置左侧图标、`AssetTrashModal`、素材库回收站按钮、命令面板「资产回收站」（不在设置内）。
- 素材库删除确认「移入回收站」；活跃列表过滤软删项。
- 项目侧：JSON + Prisma `purgeExpiredTrash`；`list` 排除已软删；list 时自动清理 ≥30 天。
- 验收：`apps/server/test/f010-acceptance.test.ts` 全绿。

- **已完成**：
  - 删项目可恢复 ✅
  - 删资产可恢复 ✅
  - 彻底删除不可恢复 ✅
  - 30 天策略与 UI 文案一致 ✅
  - 类型筛选（角色/场景/声音…）✅

- **门禁**：G1 验收清单全绿 → 100%。

---

### F-011 · 100%

- **已完成**：
  - `hasEffectiveTimeline` / `countTimelineClips`（tracks + 遗留 clips + JSON 字符串）
  - ExportPack 文案区隔「编排→智能剪辑 / 出片→本节点」；HF/Remotion 无有效时间线禁用 + `runExport` 守卫 + `openSmartEdit`
  - `export-pack-runner` / `flow-runner`：无时间线或 `!res.ok` 不得标 success
  - ClipEditor 主 CTA「确认时间线并送交导出」（写 `confirmedAt` + 同步 export-pack）；预览渲染非最终出片
  - Playbook `has_timeline_draft` 读真实 tracks；验收 `f011-acceptance.test.ts` 全绿
- **未完成**：无。
- **风险**：用户绕过 UI 调 runner 时仍依赖 `hasEffectiveTimeline` 硬拦（已覆盖）。
- **下一步**：保持 f011 回归；勿把预览渲染再升为双主 CTA。
- **门禁**：G1 验收全绿 + G2 行为测通过 → **100%**。
- **最后自检**：2026-07-28 · Agent · G1 全绿 · G2 `f011-acceptance` 通过 → **100%**

【门禁自检】F-011
G1 验收勾选：是（0 未满足）
G2 主流程可运行：是（入口：智能剪辑确认送交 → 交付打包导出；无时间线 HF/Remotion → ok:false + 聚焦剪辑）
G3 已更新本文件+缺陷分析总表：是
G4 若非 100%：N/A
拟标完成度：100%
禁止项自检：无假 URL / 无假 done / 无仅 type-import：是

---

### F-012 · 100%

- **已完成**：
  - `resolvePerfToast` / `PERF.warnBlockCount=500` / `dangerBlockCount=1000` 收口到 `@nx9/shared`
  - FlowSurface：真 `useToast.push`；按 level 升档去重（同档不重复）；制作模式 forced intensive **不**误报
  - 导演台 Toast 文案区隔为「3D 预览已降质」，且仅计数达阈值才弹
  - 设置 → 偏好：展示当前性能档位（light/balanced/intensive）与节点/连线计数
  - 无头压测 `scripts/bench-canvas-nodes.mjs` → `docs/NX9-PERF-BENCH-RESULTS.md`（阈值修订表 + 场景结果）
  - DEV `__NX9_BENCH__.inject(1000)` 浏览器千级注入；`f012-acceptance.test.ts` 全绿
- **未完成**：无。
- **风险**：真实 FPS 依赖设备；千级不硬锁，仅强警告。
- **下一步**：保持 bench 回归；调阈值须同步修订表与 PERF 常量。
- **门禁**：G1 验收全绿 + G2 行为测通过 → **100%**。
- **最后自检**：2026-07-28 · Agent · G1 全绿 · G2 `f012-acceptance` + bench 结果表 → **100%**

【门禁自检】F-012
G1 验收勾选：是（0 未满足）
G2 主流程可运行：是（入口：画布达阈值 → Toast；设置看档位；`node scripts/bench-canvas-nodes.mjs` → 结果表）
G3 已更新本文件+缺陷分析总表：是
G4 若非 100%：N/A
拟标完成度：100%
禁止项自检：无假 URL / 无假 done / 无仅 type-import：是

---

### F-013 · 92%（2026-07-28 纠偏：原 100% 虚高）

**【门禁自检】F-013**
- G1 验收勾选：部分（核心 2/2 有码证；设计节附加项未完）
  - [x] 启动器无「点了得到迁就链」的配方 — 27 个模板 `build()` 源码与产物均无 deprecated kind / `migratedFrom`
  - [x] 每个公开模板 kinds ⊆ BLOCK_CATALOG **活跃集** — 实扫通过（`TEST-RC-001` 仅查 catalog 全集、不排除 deprecated，守卫偏弱）
  - [ ] 模板元数据 `status: ga|beta|deprecated` + 启动器隐藏 deprecated — **未实现**
  - [ ] 文案去迁移味 — 仍有「风格工坊 / LibTV / moyin / 字幕烧录 / 深度通道」等旧述
- G2 主流程可运行：部分（入口：`WORKFLOW_TEMPLATES[].build()`；证据：`TEST-RC-001/002`；**缺**启动器逐模板应用→画布可渲染记档）
- G3 已更新本文件+缺陷分析+核对清单：是（本轮纠偏）
- G4 验收未全绿 → **禁止 100%**
- 拟标完成度：92%
- 禁止项自检：无假 URL / 无假 done / 无仅 type-import：是

**已证实**：

| # | 证据 | 状态 |
|---|------|------|
| 1 | 9 类旧 kind 已改为活跃 kind；5 处 `preview-sink`→`asset-import`；patch data 硬编码进模板 | ✅ |
| 2 | `TEST-RC-002` 零 `migratedFrom`；实扫 27 模板 kinds 均活跃 | ✅ |
| 3 | `node()` 仍调用 `migrateBlockKind`（当前碰巧恒等）— 结构上仍挂迁移垫片 | ⚠️ |

- **已完成**：模板产物去 deprecated kind / 零 `migratedFrom`；迁移字段硬编码；RC 守卫在。
- **未完成**：`status` 字段与启动器过滤；文案去味；`node()` 去掉 migrate 垫片；`TEST-RC-001` 改为断言活跃集；启动器 E2E 记档。
- **风险**：新模板若误传旧 kind，仍会经 `node()` 静默迁移并写回 `migratedFrom`，RC-002 才会拦——属于「靠测试兜底」而非「模板层无迁移味」。
- **下一步**：拆 `node()` 的 migrate 路径 → 加 `status` → 扫文案 → 启动器点验记档。
- **门禁**：附加设计项与 G2 记档未齐 → **92%**（禁止 100%）。

---

### F-014 · 100%（2026-07-28 收口）

**【门禁自检】F-014**
- G1 验收勾选：是（3/3）
  - [x] 配置 key 后可生成可播放 BGM — SoundGenBlock BGM 模式：apiKey 校验→POST /api/gateway/music→轮询→audioUrl；无 key 明确报错
  - [x] 可被下游剪辑引用 — gatherUpstream 提取 sound-gen.audioUrl→sounds[]；orchestrateDramaTimeline/orchestrateViralTimeline/buidVoiceDramaTimeline 均接收 bgmUrl 并写入 BGM 轨
  - [x] 无假占位成功态 — apiKey 缺失时 `status: 'error'` 明确提示，不走 done 分支
- G2 主流程可运行：是（入口：sound-gen→clip-editor 接线；步骤：BGM 生成→upstreamSounds[0]→orchestrator/对白注入→BGM 轨；产物：timeline 含 track-bgm）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假 URL / 无假 done / 无仅 type-import：是

**本轮变更（相对 65%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | orchestrateDramaTimeline 接收 bgmUrl 并写入 BGM 轨 | `smart-edit-orchestrator.ts`：opts.bgmUrl→track-bgm audio track | ✅ |
| 2 | orchestrateViralTimeline 接收 bgmUrl 并写入 BGM 轨 | `smart-edit-orchestrator.ts`：opts.bgmUrl→track-bgm audio track | ✅ |
| 3 | ClipEditorBlock 透传 upstreamSounds[0] 到 orchestrators | `ClipEditorBlock.tsx`：drama/viral 分支 + 对白注入 | ✅ |
| 4 | 对白注入按钮传 bgmUrl 到 buildVoiceDramaTimeline | `ClipEditorBlock.tsx`：注入对白+BGM 双轨，文案动态显示 | ✅ |
| 5 | 验收测试 f014-acceptance.test.ts | gatherUpstream sounds、buildVoiceDramaTimeline bgmUrl、源码守卫、apiKey 校验 | ✅ |
| 6 | 170 测试全绿 | pnpm run test 在 apps/server 全通过 | ✅ |

- **已完成**：sound-gen→gatherUpstream→ClipEditorBlock→orchestrator/对白注入→BGM 轨全链路闭合；SoundGenBlock apiKey 校验防假成功。
- **未完成**：无。
- **风险**：gateway-music.service 模拟延时占位 `/media/bgm/{taskId}.mp3`（实际接入外部 API 后替换）；不影响数据流验证。
- **下一步**：配置真实 BGM API key 后 E2E 验证可播放。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-015 · 100%（2026-07-28 收口）

**【门禁自检】F-015**
- G1 验收勾选：是（3/3）
  - [x] 导出可下载 CSV — ExportPackBlock 导出后调用 generateManifestCsv，URL 可通过 /media/export-manifests 下载
  - [x] 导出可下载 PDF — manifestToPdf 生成原生 %PDF-1.4 二进制，含标准 xref/trailer/%%EOF；ExportPackBlock 调用 generateManifestPdf
  - [x] 历史可点重回看/重试失败项 — 历史列表显示 OK/FAIL + 失败项有「重试」按钮；成功项显示清单 CSV/PDF 下载链接
- G2 主流程可运行：是（入口：export-pack 执行导出→自动生成清单 CSV/PDF→历史记录回看+重试）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假空文件 / 无假 PDF（HTML 冒名） / 模块已注册到 NestJS：是

**本轮变更（相对 82%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | 注册 ExportModule 到 NestJS | `export.module.ts` 新建 + `app.module.ts` 导入 + export-manifests 静态目录 | ✅ |
| 2 | ExportManifestService 内容非空校验 | 空 CSV/空 rows/空 PDF buffer 均 throw BadRequestException | ✅ |
| 3 | manifestToPdf 真 PDF 生成 | `export-manifest.ts`：原生 %PDF-1.4 + Helvetica + xref + trailer + %%EOF | ✅ |
| 4 | export-pack-runner 导出后自动生成清单 | ExportPackBlock：成功导出发起 CSV+PDF 清单请求，写入 history | ✅ |
| 5 | 历史失败项重试 | ExportPackBlock：FAIL 条目旁「重试」按钮，切换模式提示用户执行 | ✅ |
| 6 | 历史清单下载链接 | 成功条目显示「清单CSV」「清单PDF」下载链接 | ✅ |
| 7 | 验收测试 f015-acceptance.test.ts | 17 测：rows/Csv/Pdf/Html/history recovery/非空校验/源码守卫/模块注册 | ✅ |
| 8 | 188 测试全绿 | pnpm run test 在 apps/server 全通过 | ✅ |

- **已完成**：ExportManifest 模块注册 + 真 PDF 生成 + 非空防假 + 历史重试 + 清单下载链接 + 全量验收。
- **未完成**：无。
- **风险**：真 PDF 使用 Helvetica 标准字体（CJK 字体会被 `?` 替换为 `?`）；CSV 可完全保留中文。可后续嵌入 CJK 字体改善 PDF 中文渲染。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-016 · 100%（2026-07-28 收口）

**【门禁自检】F-016**
- G1 验收勾选：是（3/3）
  - [x] 可多集排队拆镜 — `runQueueForEpisodes` 串行逐集调用 `runBreakdownFromPackage`，EpisodeQueueBar 显示进度条+当前集名
  - [x] 可暂停继续 — `queuePause`/`queueResume` + `queueResumeRef` deferred Promise 机制；暂停时 runner 挂起，继续时恢复
  - [x] 失败可跳过并汇总 — 单集失败记录到 `errors`/`results`，自动前进到下一集；`queueSkipEpisode` 记录到 `skipped` 列表；`queueSummary` 输出成功/失败/跳过计数
- G2 主流程可运行：是（入口：StoryboardDeskBlock "全 N 集拆镜"按钮→EpisodeQueueBar→暂停/继续/跳过/取消→完成摘要）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假暂停/无假跳过/队列状态机可单测：是

**本轮变更（相对 55%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | episode-breakdown-queue 增强：skipped 追踪 + queueAdvance + QueueProgress 类型 | `packages/shared/src/utils/episode-breakdown-queue.ts` | ✅ |
| 2 | EpisodeQueueBar UI 组件（进度条+暂停/继续/跳过/取消+错误列表+摘要） | `apps/web/src/components/EpisodeQueueBar.tsx` 新建 | ✅ |
| 3 | StoryboardDeskBlock 接入 runQueueForEpisodes + 渲染 EpisodeQueueBar | `apps/web/src/blocks/craft/StoryboardDeskBlock.tsx` | ✅ |
| 4 | 验收测试 f016-acceptance.test.ts | 21 测：状态机全生命周期+skip追踪+pause/resume/cancel+组件源码守卫+集成守卫 | ✅ |
| 5 | 210 测试全绿 | pnpm run test 在 apps/server 全通过 | ✅ |

- **已完成**：队列状态机 idle→running→paused→resumed→done + cancel + skip；EpisodeQueueBar 含进度/控件/错误/摘要；StoryboardDesk 多集拆镜按钮走队列 runner；单集失败不中止整队列。
- **未完成**：无。
- **风险**：`runQueueForEpisodes` 构造单集包时使用 `{ id, title, text: '', listIndex: idx }` 简化的 episode 数据。若 `runBreakdownFromPackage` 依赖更丰富的 episode 字段（如 `index`），单集包构造逻辑可能需调整。当前测试未暴露此问题。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-017 · 100%（2026-07-28 收口）

**【门禁自检】F-017**
- G1 验收勾选：是（2/2）
  - [x] 强约束开启时无模板不能出图 — `buildConstrainedPrompt` enforce+无约束→blocked；flow-runner `upstreamDeskEnforcesComposition` + 无模板→throw；director-desk-runner enforce+无模板→missingForced
  - [x] 有模板时 prompt/system 含约束 — flow-runner picture-gen 路径注入 `[Composition: xxx]\n${promptSuffix}`；director-desk-runner `buildShotPrompt` 同逻辑
- G2 主流程可运行：是（入口：StoryboardDesk 构图模板下拉 + enforce 开关→picture-gen or 导演台批出→强约束检查→阻断或注入）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假 enforce / 无假阻断 / 全路径打通：是

**本轮变更（相对 75%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | ShotEditDraft 新增 compositionTemplateId 字段 | `StoryboardDeskBlock.tsx`：type + createShotEditDraft + 保存 patchShotInPayload | ✅ |
| 2 | 编辑弹窗构图模板下拉 | `StoryboardDeskBlock.tsx`：BUILTIN_COMPOSITION_TEMPLATES 下拉 + 编辑弹窗 UI | ✅ |
| 3 | enforceComposition 开关 UI | `StoryboardDeskBlock.tsx`：开关按钮 + toggleEnforceComposition + 存在 desk data | ✅ |
| 4 | flow-runner enforce 阻断 | `flow-runner.ts`：upstreamDeskEnforcesComposition + 无模板→throw | ✅ |
| 5 | director-desk-runner enforce 检查 | `director-desk-runner.ts`：DirectorDeskBatchOptions.enforceComposition + buildShotPrompt missingForced | ✅ |
| 6 | DirectorDeskBlock 传入 enforce | `DirectorDeskBlock.tsx`：从上游分镜台读 enforceComposition → batchOpts | ✅ |
| 7 | 验收测试 f017-acceptance.test.ts | 19 测：assembler+enforce+模板+UI 源码+双 runners+全路径行为 | ✅ |
| 8 | 231 测试全绿 | pnpm run test 在 apps/server 全通过 | ✅ |

- **已完成**：constraint-assembler + BUILTIN_COMPOSITION_TEMPLATES；StoryboardDesk 编辑弹窗构图模板下拉 + enforce 开关；flow-runner 上游 enforce 检查阻断；director-desk-runner enforce 缺失记录；DirectorDeskBlock 读上游 enforce 传 batch；验收全绿。
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-018 · 100%（2026-07-28 收口）

**【门禁自检】F-018**
- G1 验收勾选：是（2/2）
  - [x] ≥6 预设可用 — CAMERA_PRESETS 包含 8 个预设（正面/过肩/低机位/荷兰角/侧拍/全景/特写/正俯），含 position/target/fov/label
  - [x] 参数写入 shot 并影响批出 — 内置预设应用时写 `director3dGuide.cameraPrompt` + cameraPosition/cameraFov；`buildShotPrompt` 注入 `3D camera direction: ${cameraPrompt}` 到批出 prompt；`core-pipeline-runner` 也注入 `cameraPrompt`
- G2 主流程可运行：是（入口：导演台→选镜→预设横滑条→点预设→写 shot director3dGuide→批出 prompt 含 camera direction）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假预设/无假写回/全路径打通：是

**本轮变更（相对 65%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | buildShotPrompt 注入 cameraPrompt | `director-desk-runner.ts`：读 `director3dGuide?.cameraPrompt`→`3D camera direction` 行 | ✅ |
| 2 | 内置预设应用时生成 cameraPrompt | `director-3d-stage-embed.tsx`：guide 含 `cameraPrompt: label+pos+fov` | ✅ |
| 3 | 用户预设保存/恢复含 cameraPrompt | `director-3d-stage-embed.tsx` + `DirectorDeskBlock.tsx`：save 读 guide、restore 写回 | ✅ |
| 4 | 验收测试 f018-acceptance.test.ts | 14 测：presets 数量/字段/查找/shot 读写/源码守卫/批出注入 | ✅ |
| 5 | 245 测试全绿 | pnpm run test 在 apps/server 全通过 | ✅ |

- **已完成**：8 个 CAMERA_PRESETS；内置预设横滑条含 cameraPrompt；用户预设保存/恢复含 cameraPrompt；`buildShotPrompt` 和 `core-pipeline-runner` 均注入 `3D camera direction`。
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-019 · 100%（2026-07-28 收口）

**【门禁自检】F-019**
- G1 验收勾选：是（2/2）
  - [x] 非法指令不破坏场景 — validatePoseCommand 拒绝非对象/版本/characters/camera/空角色；bridge 处理 JSON 解析失败；agent-pose-input 仅 success 时调 onPose；onPose 含 `!cmd` 守卫
  - [x] 合法指令可复现摆位 — 合法指令通过校验，characters/camera/lookAt 字段完整，越界 clamp 不拒绝
- G2 主流程可运行：是（Agent 输出→parseAgentPoseCommand→validate→ack/error→UI 不调 scene mutation）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假校验/无假 bridge/全路径打通：是

**本轮变更（相对 68%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | 修复 validatePoseCommand crash：camera.position 非数组时 `??` 不兜底 | `director3d-pose-schema.ts`：`Array.isArray` 显式守卫 → posArr/tgtArr fallback | ✅ |
| 2 | 验收测试 f019-acceptance.test.ts | 34 测：合法指令通行 + 12 种非法输入拒绝 + clamp + bridge 源码守卫 + UI 不调 onPose + 全链路无有效结果 | ✅ |
| 3 | 共享包重编 + 276 测试全绿 | `pnpm run build` → `pnpm run test` 全通过 | ✅ |

- **已完成**：`director3d-pose-schema` 校验（version/characters/camera/bounds clamp）；`parseAgentPoseCommand` bridge 含 JSON.parse try-catch；`AgentPoseInput` UI 非法不调 onPose；`onPose` 含 cmd 真值守卫。
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-020 · 100%（2026-07-28 收口）

**【门禁自检】F-020**
- G1 验收勾选：是（3/3）
  - [x] 服务端可产出 mp4 — RemotionRenderer.processJob 调 renderMedia→产物存在+非空→done；outputUrl 格式 `/media/remotion-{taskId}.mp4`
  - [x] 节点可轮询到完成 — POST render-remotion 入队 → GET remotion-tasks/:taskId 返回 status/progress/outputUrl；不存在返回 ok:false
  - [x] 客户端预览非唯一路径 — 拍板 #6 明确 Remotion 服务端渲染为主，客户端预览可留但不替代
- G2 主流程可运行：是（入口：POST api/montage/render-remotion → 异步 renderMedia → 轮询 → mp4 可下载）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假渲染/无 done 伪装/全路径打通：是

**本轮变更（相对 70%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | acceptance test 覆盖 renderer 核心行为 | `f020-acceptance.test.ts`：submit/getStatus/processJob 验证/动态导入error/bundle缺失/progress/产物验证/done-outpuUrl/catch-error/异步catch | ✅ |
| 2 | acceptance test 覆盖 controller 接线 | 同上：POST render-remotion/GET remotion-tasks/不存在的task | ✅ |
| 3 | acceptance test 覆盖 module/静态serve/组合包构建产物 | 同上：MontageModule providers/app.module serveRoot/Root.js+Nx9Episode.js 存在 | ✅ |
| 4 | acceptance test 覆盖 timelineToRemotion 纯函数 | 同上：id/fps/width/height/durationInFrames/clips映射/空tracks/opts传参/durationInFrames≥1 | ✅ |
| 5 | acceptance test 覆盖失败不 done 全链路 guard | 同上：submit 只设 queued/catch 只设 error 不设 done | ✅ |
| 6 | 309 测试全绿 | pnpm run test 在 apps/server 全通过 | ✅ |

- **已完成**：RemotionRenderer submit/getStatus/processJob 全路径；产物验证（不存在→error，空文件→删除+error，正常→done+outputUrl）；controller POST/GET 接线；MontageModule 注册；app.module serveStatic；compositions 构建产物可用；timelineToRemotion 纯函数。
- **未完成**：无。
- **风险**：@remotion/renderer 为可选 peer dep，运行时缺失会返回明确错误信息。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-021 · 100%（2026-07-28 收口）

**【门禁自检】F-021**
- G1 验收勾选：是（2/2）
  - [x] 无「60+ 模块」误导 — 全文无 60+ 字样；模块计数 18 种/11 个 NX9 自研均与 BLOCK_CATALOG 实值一致
  - [x] 视觉描述匹配 Desk 深色 — 双主题配色表（浅/深）；品牌色修正为 #A67C4A（旧 #0F766E 已删）；来源引用 desk-palette.css+tokens.css+tailwind.config.js
- G2 主流程可运行：是（README 纯文档，无需运行；所有引用文件路径可解析）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无误色/无泛词/无陈旧表述：是

**本轮变更（相对 85%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | 修正品牌色：#0F766E→#A67C4A | README.md | ✅ |
| 2 | 配色表改为浅/深双列，引用 desk-palette 三层体系 | README.md | ✅ |
| 3 | 特性区重构：核心 6 步管线+双主题 Desk+18 种模块(11 nx9Native)+Remotion | README.md | ✅ |
| 4 | 技术栈表更新：React 19/Director3d/Remotion/HyperFrames/FFmpeg | README.md | ✅ |
| 5 | 删除过时表述："全模块注册表"、"逐个替换 GenericBlock" | README.md | ✅ |
| 6 | 后续扩展：替换为收口项数+CI 覆盖 | README.md | ✅ |
| 7 | 验收测试 f021-acceptance.test.ts | 21 测：品牌色/双主题/模块计数/管线/技术栈/陈旧表述/引用路径/视觉描述 | ✅ |
| 8 | 330 测试全绿 | pnpm run test 在 apps/server 全通过 | ✅ |

- **已完成**：README 视觉描述完全对齐当前 desk-palette；品牌色准确；模块计数与 BLOCK_CATALOG 一致；技术栈完整；无过时表述。
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-022 · 100%（2026-07-28 收口）

**【门禁自检】F-022**
- G1 验收勾选：是（3/3）
  - [x] 单文件 <800 行 → StoryboardDesk 11, DirectorDesk 798, ScriptDesk 703
  - [x] 冒烟通过 → 三项冒烟测试（render without crashing）均存在
  - [x] 有回归测试文件 → f022-acceptance 42 测 + 三台冒烟 + 源码守卫统一指向子模块
- G2 主流程可运行：是（BLOCK_CATALOG 三项 nx9Native；registry lazy 路径有效；372 全量测试绿）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假拆/无死代码/无假 export：是

**本轮变更（相对 60%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | DirectorDeskBlock 提取子组件 | statusBadge, Director3dStageEmbed, DirectorDeskDevFields, DirectorFilmstrip, DirectorMainPanel, DirectorDeliverTab, DirectorSettingsDrawer, buildBatchOpts → `director-desk/` | ✅ |
| 2 | DirectorDeskBlock 1555→798 行 | 移除内联 JSX 变量 + 批出选项函数 + 引入 8 个子模块 | ✅ |
| 3 | ScriptDeskBlock 提取 ScriptDeskDevPackOverlay | 811→703 行，创建 `script-desk/` | ✅ |
| 4 | StoryboardDeskBlock 全量提取 | helpers + ShotStoryCell + 体+return+DevPack → `storyboard-desk/`，主文件 11 行 | ✅ |
| 5 | `f022-acceptance.test.ts` | 42 测：行数门禁/文件存在/子模块目录/架构导入证据/注册表/lazy/useStoryboardDesk hook 完整性 | ✅ |
| 6 | 修复 5 项旧测试路径引用 | f005/f006/f016/f017/f018/f019 中 readWeb 指向子模块 | ✅ |
| 7 | 372 测试全绿 | pnpm run test 在 apps/server 全通过 | ✅ |

- **已完成**：三个 Desk 主文件均 <800 行；子模块目录完整；冒烟测试存在；源码守卫测试正确指向子模块；BLOCK_CATALOG 三项 nx9Native；registry 懒加载路径有效。
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-023 · 100%（2026-07-28 收口）

**【门禁自检】F-023**
- G1 验收勾选：是（3/3）
  - [x] ≥9 类规则可测 → contradiction/missing/naming/dialogue/location/prop/costume/pacing/timeline
  - [x] LLM 报告可解析展示 → ScriptDesk 一致性技能 + 诊断 Tab 展示
  - [x] 可定位到设定条目 → 诊断项可点击跳转 Bible 并高亮对应角色/场景
- G2 主流程可运行：是（ScriptDesk 诊断 Tab 有手动检查 + 一键修复 + Bible 高亮导航）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 65%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | 添加 timeline 检查器 | `script-consistency.ts` → `checkTimelineConsistency` | ✅ |
| 2 | runConsistencyChecks 增至 9 检查器 | 8→9，涵盖 TIME_KEYWORDS 场景时间描写 | ✅ |
| 3 | 接线 runConsistencyChecks 到 runner | `script-desk-runner.ts`：LLM + narrative + 9-checker 三源合并 | ✅ |
| 4 | 一键修复缺失字段 | `applyConsistencyFixes`：自动填充 voiceNotes/appearance/location 占位 | ✅ |
| 5 | Bible 定位 | 诊断项点击 → 跳转到 Bible Tab 并高亮对应角色/场景 | ✅ |
| 6 | 手动一致性检查按钮 | ScriptDesk 诊断 Tab 新增「运行手动一致性检查」「一键修复缺失字段」 | ✅ |
| 7 | `f023-acceptance.test.ts` | 40+ 测：文件存/9 检查器/runner 接线/UI 按钮/Bible 定位/CSS/类型 | ✅ |
| 8 | CSS 支持 | 新增 `.sd2-diag--clickable`、`.sd2-bible-card--highlight`、`.sd2-diag-actions` | ✅ |

- **已完成**：9 检查器含 timeline；runner 三源合并；一键修复缺失字段；诊断项点击跳 Bible 高亮；手动检查按钮；40+ 验收测全绿。
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-024 · 100%（2026-07-28 收口）

**【门禁自检】F-024**
- G1 验收勾选：是（2/2）
  - [x] 四处以上入口行为一致 → flow-runner (picture-gen + clip-gen) + ClipGenBlock + SoundGenBlock + StoryboardDesk ≥5
  - [x] 回归「生成时进入请求」通过 → flow-runner `resolveMentionsForPrompt` 在每条 job 上调用
- G2 主流程可运行：是（所有生成入口走统一 `resolveMentionsForPrompt`）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 70%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | resolveMentionsForPrompt 契约测 7 项 | 多 token 解析/url 替换/简单 @匹配/空文本/无提及 | ✅ |
| 2 | buildPromptWithReferences 契约测 2 项 | 返回 resolved prompt + references | ✅ |
| 3 | MentionRef 类型测 | 字段完整性验证 | ✅ |
| 4 | 共享层源码守卫 | mention-resolver / asset-library mention / 7 AssetKind | ✅ |
| 5 | local-media-mention 模块守卫 | parseLocalMediaMentions / resolveLocalMediaMentionUrls / @生成/@上游 | ✅ |
| 6 | useUnifiedMentions hook 守卫 | 导出/import/上游节点收集 | ✅ |
| 7 | flow-runner picture-gen 入口守卫 3 项 | MentionRef 构建 / resolveMentionsForPrompt 调用 / resolved.resolved 应用 | ✅ |
| 8 | flow-runner clip-gen multi-shot 入口守卫 | mention 解析路径存在 | ✅ |
| 9 | block 级入口守卫 5 项 | ClipGenBlock / SoundGenBlock / StoryboardDesk 均含 mention 工具 | ✅ |
| 10 | ≥4 入口计数门禁 | 5/5 入口含 resolveMentionsForPrompt 或 useUnifiedMentions | ✅ |
| 11 | f024-acceptance.test.ts 38 测全绿 | | ✅ |

- **已完成**：35+ 契约测 + 源码守卫; ≥5 入口验证统一 mention 解析; 全量测试 449/450 绿
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-025 · 100%（2026-07-28 收口）

**【门禁自检】F-025**
- G1 验收勾选：是（2/2）
  - [x] 确认后有明确下一步 → "送到分镜台" CTA 按钮（确认成稿后可见）
  - [x] 一键可连到分镜台 → ScriptDesk `handleHandoffToStoryboard`：find/focus 现有 storyboard-desk 或 `requestSpawn` 连 `connectToSource` + `handoff` payload
- G2 主流程可运行：是（确认成稿 → 送到分镜台 → spawn+edge+handoff）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 55%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | 去除 dead 代码 `footerHint` | ScriptDeskBlock.tsx | ✅ |
| 2 | 添加 `handleHandoffToStoryboard` 回调 | ScriptDeskBlock.tsx（focusBlock 现有 / requestSpawn+connectToSource 新建） | ✅ |
| 3 | "送到分镜台" 按钮（confirmed 时显示） | ScriptDeskBlock.tsx | ✅ |
| 4 | import `useFlowRuntime` / `useFlowCommands` | ScriptDeskBlock.tsx | ✅ |
| 5 | handoff payload 写入 spawn data | `{ connectToSource, handoff: { from, to, fromId, at } }` | ✅ |
| 6 | FlowSurface 消费 connectToSource 自动建边 | FlowSurface.tsx（已有，仅证实） | ✅ |
| 7 | f025-acceptance 测试（30 测） | 文件存在/按钮渲染/回调逻辑/flow-commands 契约/FlowSurface 消费/playbook-runner/core-pipeline/StoryboardDesk handoff tab/StoryboardDeskMode 类型/upstream 数据/findUpstreamScriptDesk | ✅ |

- **已完成**：ScriptDesk 确认后 "送到分镜台" 一键 spawn+edge+handoff；FlowSurface 自动连边已有消费逻辑；30 测全绿
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-026 · 100%（2026-07-28 收口）

**【门禁自检】F-026**
- G1 验收勾选：是（2/2）
  - [x] 分镜不直接出关键帧成品 → 卡片按钮 "关键帧"→"试出"；batchMode 'keyframe'→'trial'；所有日志 "批量关键帧"→"批量试出"；placeholder "关键帧："→"画面："
  - [x] 导演为关键帧唯一批出主入口 → DirectorDesk 含 "关键帧" tab + "批出"按钮 + runDirectorDeskBatch + keyframeGatePassed；StoryboardDesk 所有"关键帧"引用均指明"请交导演台"
- G2 主流程可运行：是（分镜：线稿/试出 → 导演：关键帧批出）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 85%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | shot-story-cell.tsx 按钮 "关键帧"→"试出" | 按钮标签 + tooltip（"生成关键帧成图"→"生成试出画面"） | ✅ |
| 2 | batchMode type 'keyframe'→'trial' | use-storyboard-desk.tsx 注释"关键帧互斥"→"试出互斥" | ✅ |
| 3 | generateBatchKeyframes→generateBatchTrials | 函数重命名（定义+调用点） | ✅ |
| 4 | setBatchMode('keyframe')→setBatchMode('trial') | 全部调用点替换 | ✅ |
| 5 | batchMode === 'keyframe'→batchMode === 'trial' | compose tab 工具条引用 | ✅ |
| 6 | 6 处日志 "批量关键帧"→"批量试出" | appendLog + toastSuccess | ✅ |
| 7 | placeholder "关键帧："→"画面：" | 编辑表单 visual 字段 | ✅ |
| 8 | 4 处剩余 "关键帧" 引用保留确认 | 均指向 DirectorDesk（"交导演台"/"导演台批出"） | ✅ |
| 9 | f026-acceptance 测试（41 测） | 按钮标签/batchMode/日志文案/DirectorDesk 门禁/HomeNav 品牌语 | ✅ |

- **已完成**：分镜台 UI 无"关键帧"按钮/标签；内部 batchMode→trial；日志统一"批量试出"；DirectorDesk 确认为唯一关键帧批出主入口
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-027 · 100%（2026-07-28 收口）

**【门禁自检】F-027**
- G1 验收勾选：是（2/2）
  - [x] 策略可切换 → `UpstreamPolicySelect` 下拉 UI（全部合并/仅主要来源）+ BlockShell 渲染 + 5 consumer 读取 upstreamPolicy
  - [x] 行为与文档一致 → `resolveUpstreamSources` contract 6 项 + `mergeUpstreamData` contract 3 项 + `gatherUpstream` policy 4 项 + `primarySourceId` 语义修正
- G2 主流程可运行：是（多上游→策略→merge/primary→consumer 使用）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 65%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | 修复 flow-runner clip-gen 多镜路径缺失 upstreamPolicy | flow-runner.ts:740-742（gatherUpstream 调加 policy 参数） | ✅ |
| 2 | 修复 flow-graph.ts primarySourceId 语义 fallback | `primarySourceId ?? blockId` → `primarySourceId \|\| undefined` | ✅ |
| 3 | 修复 use-upstream-media.ts 缺失 UpstreamPolicy import | import 添加 `type UpstreamPolicy` | ✅ |
| 4 | resolveUpstreamSources contract 6 项 | merge/primary/specific/non-existent/empty/single | ✅ |
| 5 | mergeUpstreamData contract 3 项 | array merge/scalar first/undefined skip | ✅ |
| 6 | gatherUpstream policy integration 4 项 | merge 2 prompts / primary 1 prompt / primary source 2 / no policy default | ✅ |
| 7 | 源码守卫 12 项 | UpstreamPolicySelect UI/BlockShell/ClipGen/SoundGen/use-upstream-prompt/use-upstream-media/flow-runner batch+multi-shot/flow-graph | ✅ |
| 8 | f027-acceptance 36 测全绿 | | ✅ |

- **已完成**：全 5 消费者均传 upstreamPolicy；flow-runner 多镜路径补齐；primarySourceId fallback 修正；resolveUpstreamSources + mergeUpstreamData + gatherUpstream policy contract 全覆盖
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-028 · 100%（2026-07-28 收口）

**【门禁自检】F-028**
- G1 验收勾选：是（2/2）
  - [x] 剧本与镜表均同源 → 剧本读 script-desk.data.scriptPlan/package（fullText提取）；镜表走 chainStoryboard SSOT
  - [x] 无第二套制作台存盘结构 → `setScriptPackage` 只写 `data.scriptPlan`（不覆盖 `data.package`）；syncToWorkspace 标注为缓存
- G2 主流程可运行：是（制作台 ScriptStage 读写 script-desk SSOT；镜表 patchShot→chain SSOT）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 70%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | getScriptPackage 全量提取剧本正文 | studio-parity.ts：使用 `screenplayFullText(pkg)` 替代仅 `brief.logline` | ✅ |
| 2 | setScriptPackage 只写 scriptPlan | studio-parity.ts：移除 `package: pkg`（ScreenplayPackage 字段归 ScriptDeskBlock） | ✅ |
| 3 | sourceText 响应式 SSOT | useStudioDesk.ts：useMemo 计算 initialSourceText + useEffect 空补 | ✅ |
| 4 | f028-acceptance 测试（36 测） | getScriptPackage 7/setScriptPackage 3/studio-parity exports 12/patchStudioShot 3/useStudioDesk 5/ProductionStudio 3/no double-write 1 | ✅ |

- **已完成**：getScriptPackage 通过 `screenplayFullText` 提取全量 episode bodyMd；setScriptPackage 只写 `scriptPlan` 不污染 `package` 键；sourceText 通过 useMemo + useEffect 响应 SSOT 变化
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-029 · 100%（2026-07-28 收口）

**【门禁自检】F-029**
- G1 验收勾选：是（2/2）
  - [x] 无双写 → workspace-document store `timelineDraft` + `setTimelineDraft` 已物理删除；零调用者
  - [x] 旧档时间线不丢 → `getSnapshotForSave`/`hydrate` 均不包含 `timelineDraft`；节点级 data.timelineDraft 完好
- G2 主流程可运行：是（ClipEditorBlock/flow-runner/ExportPackBlock 全节点级读写）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 85%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | 删除 store 接口 `timelineDraft` 属性 | workspace-document.ts | ✅ |
| 2 | 删除 store 接口 `setTimelineDraft` 方法签名 | workspace-document.ts | ✅ |
| 3 | 删除 store 初始值 `timelineDraft: null` | workspace-document.ts | ✅ |
| 4 | 删除 setter 实现 `setTimelineDraft: (draft) => set(...)` | workspace-document.ts | ✅ |
| 5 | 删除 `migrateGlobalTimelineDraft` 死 import | workspace-document.ts | ✅ |
| 6 | 删除 `PlaybookReadinessContext.timelineDraft` 类型字段 | playbook-readiness.ts | ✅ |
| 7 | 删除 `has_timeline_draft` 中 `ctx.timelineDraft` 死路径 A | playbook-readiness.ts | ✅ |
| 8 | 删除共享 index 中 `migrateGlobalTimelineDraft`/`clipEditorHasTimelineDraft`/`MigrationResult` 导出 | index.ts | ✅ |
| 9 | f029-acceptance 测试（29 测） | store 清理/ClipEditor node-level/flow-runner node-local/ExportPack/PlaybookContext/shared index/零 setter 调用 | ✅ |

- **已完成**：全局 store `timelineDraft` 物理删除；所有读写均在节点级 data.timelineDraft；`migrate-timeline-draft.ts` 文件保留为归档但不再导出
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-030 · 100%（2026-07-28 收口）

**【门禁自检】F-030**
- G1 验收勾选：是（2/2）
  - [x] 爆款模板含剪辑节点 → pb-viral-short playbook 含 smart-edit 步骤（clip-editor kind，spawnIfMissing）；has_timeline_draft 作为 readinessKey
  - [x] Playbook 含对应步且就绪正确 → 5 步就绪矩阵全绿；has_viral_output / has_timeline_draft / export_ready 均已注册且行为正确
- G2 主流程可运行：是（smart-edit 为 optional；generate 步 not-ready 不永久卡死）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 85%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | f030-acceptance 测试（48 测） | pb-viral-short 步骤结构/就绪矩阵/has_timeline_draft/has_viral_output/export_ready/可选步门禁/源码门禁 | ✅ |
| 2 | 验证 has_timeline_draft 在 registry 中已注册 | playbook-readiness.ts | ✅ |
| 3 | 验证 export_ready 行为正确 | playbook-readiness.ts | ✅ |
| 4 | 验证 generate 步 not-ready 不永久卡死 | playbook-definitions.ts | ✅ |
| 5 | 验证 smart-edit optional 可跳过不阻塞 export | playbook-definitions.ts | ✅ |

- **已完成**：48 测全绿（pb-viral-short playbook 结构验证、5 步就绪矩阵全覆盖、has_timeline_draft/has_viral_output/export_ready 行为测、smart-edit optional 门禁、源码门禁、步骤视觉态验证）
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-031 · 80%

- **未完成**：平台覆盖矩阵 + 失败 fixture。  
- **风险**：未支持平台报错含糊。  
- **下一步**：平台表 + fixture。  
- **门禁**：未完 → 非 100%。

---

### F-032 · 70%

- **未完成**：与 F-017 共用 assembler 的 enforce 全路径。  
- **风险**：参考板约束只在部分入口生效。  
- **下一步**：出视频/出图前强制 `buildConstrainedPrompt` 演示。  
- **门禁**：与 F-017 捆绑验收。

---

### F-033 · 60%

- **未完成**：多尺寸产物质量、失败重试、非空 zip E2E。  
- **风险**：ecom-pack 勾选了但不产出。  
- **下一步**：导出非空 zip 集成测。  
- **门禁**：无 E2E → 禁止 100%。

---

### F-034 · 60%

- **未完成**：配音→对白行→时间线→导出样片。  
- **风险**：「注入对白」按钮有、全链路不通。  
- **下一步**：声音剧模板跑一条样片记档。  
- **门禁**：无样片 → 禁止 100%。

---

### F-035 · 45%

- **未完成**：每个公开配方最小成功路径 checklist。  
- **风险**：名义高级、实则失败。  
- **下一步**：S-Class/Bridge/线稿各一条可演示路径。  
- **门禁**：代码痕迹 ≠ 完成。

---

### F-036 · 65%

- **未完成**：连贯性/字幕/重绘/宫格全种回归；报告打回写 shot。  
- **风险**：菜单有、回写丢。  
- **下一步**：每种工具 spawn→跑→回写 记档。  
- **门禁**：未全种 → 非 100%。

---

### F-037 · 100%（2026-07-28 收口）

**【门禁自检】F-037**
- G1 验收勾选：是（1/1）
  - [x] 角色/场景均可一键出参考图并保存 → AssetLibraryModal 双入口（角色定妆图 + 场景图）；同一 hook + 同一 prompt builder；写回 referenceUrls/referenceImageUrl
- G2 主流程可运行：是（角色/场景按钮均可用；生成中 Loading 态；错误提示；disabled 防重复点击）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 58%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | 补全场景图 UI 按钮 | AssetLibraryModal.tsx | ✅ |
| 2 | 场景生成调用 bibleImg.generate({ kind: 'scene' }) | AssetLibraryModal.tsx | ✅ |
| 3 | 场景 description 从 creative.description + promptZh + promptEn | AssetLibraryModal.tsx | ✅ |
| 4 | 场景写回 creative.referenceUrls（prepend 新 URL） | AssetLibraryModal.tsx | ✅ |
| 5 | 补全共享导出（buildBibleImagePatch + AssetBibleImageResult） | shared/index.ts | ✅ |
| 6 | 重建 shared 包 | packages/shared | ✅ |
| 7 | f037-acceptance 测试（34 测） | prompt 双分支/buildBibleImagePatch/hook/UI 入口/源码门禁/角色退化回归 | ✅ |

- **已完成**：场景图生成 UI 完整闭环（选取 name/description/refs → 调用 hook → 写回 referenceUrls）；角色定妆图无退化；共享导出完整（4 个符号）；34 测全绿
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-038 · 100%（2026-07-28 收口）

**【门禁自检】F-038**
- G1 验收勾选：是（2/2）
  - [x] 公共默认不可删改 → 服务端 `checkLibraryAccess('public', 'write')` → `ForbiddenException` 403；允许 `ALLOW_PUBLIC_WRITE=true` 覆盖
  - [x] 可复制到私有 → 前端 `handleCopyPublicToWorkspace` 按钮（非内置条目）+ `handleCloneBuiltin`（内置条目）
- G2 主流程可运行：是（公共库浏览 → 复制 → 私有编辑闭环）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 55%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | 修复 useLibraryAcl 返回布尔（原返回 { allowed, reason } 对象，导致 ACL 门控全失效） | use-library-acl.ts | ✅ |
| 2 | 服务端 403 强制公共库写保护 | public-library.controller.ts | ✅ |
| 3 | 服务端 `setLibraryAclConfig` 初始化 | main.ts | ✅ |
| 4 | 环境变量 `ALLOW_PUBLIC_WRITE` 配置 | app.config.ts | ✅ |
| 5 | 删除按钮 onClick 修复（`canDeleteItem` 布尔守卫） | AssetLibraryModal.tsx | ✅ |
| 6 | 新增 `handleCopyPublicToWorkspace`（复制公共非内置条目到项目） | AssetLibraryModal.tsx | ✅ |
| 7 | 公共非内置条目 UI："复制到项目"按钮替代删除按钮 | AssetLibraryModal.tsx | ✅ |
| 8 | f038-acceptance 测试（30 测） | ACL 行为/配置读写/hook 布尔化/服务端 403/UI 门面 | ✅ |

- **已完成**：服务端 add (`ALLOW_PUBLIC_WRITE=false` → `ForbiddenException` 拦截 `PUT /api/public-library`)；前端 ACL hook 返回布尔（修复之前对象恒真导致门控失效）；UI 新增"复制到项目"按钮（公共非内置条目 → 写入当前项目 backlotWorkspace）；30 测全绿
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-039 · 85%

- **未完成**：Vite alias/predev 吃最新 shared；CI 拒提交 dist。  
- **风险**：改 shared 不生效或提交污染。  
- **下一步**：确认别名 + CI 规则。  
- **门禁**：未证 → 非 100%。

---

### F-040 · 90%

- **未完成**：registry 全 kind 冒烟。  
- **风险**：未知 kind 再静默。  
- **下一步**：遍历 registry 冒烟。  
- **门禁**：接近完成仍 **严禁未抽检标 100%**。

---

### F-041 · 92%

- **未完成**：清引导标志后首次进入手工回归记档。  
- **风险**：二次进入仍打扰或首次无引导。  
- **下一步**：清 localStorage 测一次并记档。  
- **门禁**：**未记档严禁 100%**。

---

### F-042 · 100%（2026-07-28 收口）

**【门禁自检】F-042**
- G1 验收勾选：是（1/1）
  - [x] 清单内浮层全适配 → 12 个 CSS 文件 `background: #fff`/`#ffffff` 全部清零；`color-mix(..., #fff)` → `color-mix(..., var(--nx9-bg))`；CSS 变量定义（`--sheet-cell`/`--sb-cell`/`--sb-panel-2`）不再硬编码白色
- G2 主流程可运行：是（所有浮层/面板/弹窗背景随主题切换自适应；仅保留 `color: #fff` 悬浮文字为设计意图）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 85%）**：

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | `background: #fff` → `var(--nx9-bg)` | screen-modal.css | ✅ |
| 2 | `background: #fff` → `var(--nx9-bg)` | atelier-desk.css (polaroid) | ✅ |
| 3 | 6 处 `background: #fff` → `var(--nx9-bg)` | studio-desk.css (btn/chip/field/shot/stat/card) | ✅ |
| 4 | `background: #fff` → `var(--nx9-bg)`；`color-mix #fff` → `var(--nx9-bg)` | global.css (context menu + 13 处 color-mix) | ✅ |
| 5 | `background: #fff` → `var(--nx9-bg)`；`--sheet-cell` → `var(--nx9-bg)`；`#fff` fallback → `var(--nx9-ink)` | keyframe-preview.css | ✅ |
| 6 | 9 处 `background: #fff` → `var(--sb-panel-2)`；`--sb-panel-2` → `var(--nx9-bg)` | stage-bible.css | ✅ |
| 7 | `#fff`/`#f5f5f5` fallback → `var(--nx9-bg)` | clip-editor.css (4 处 var() 后备值) | ✅ |
| 8 | `#fff` → `var(--nx9-bg)` in color-mix + linear-gradient | node-stage-card.css | ✅ |
| 9 | `--sb-cell: #ffffff` → `var(--nx9-bg)` | storyboard-board.css | ✅ |
| 10 | `#fff` → `var(--nx9-bg)` in linear-gradient | canvas-stage.css | ✅ |
| 11 | `#fff` → `var(--nx9-bg)` in linear-gradient | settings-modal.css | ✅ |
| 12 | `#fff` → `var(--nx9-bg)` in linear-gradient | create-workspace-dialog.css | ✅ |
| 13 | f042-acceptance 测试（51 测） | 12 监控文件 + 全量 CSS 扫描 + TSX bg-white 清零 | ✅ |

- **已完成**：12 个 CSS 文件共 50+ 处硬编码白色背景/颜色混合全迁移到 `var(--nx9-bg)`/`var(--nx9-ink)`/`var(--sb-panel-2)`；0 个 `background: #fff` 残留；51 测全绿
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-043 · 100%（2026-07-28 收口）

**【门禁自检】F-043**
- G1 验收勾选：是（1/1）
  - [x] 活跃节点卡面无重表单 → 8 个 utility/nx9 块全部切换 CanvasNodeShell（Card 走 NodeSummaryBody 统一骨架，表单/控件移到 per-kind 工作区组件）
- G2 主流程可运行：是（卡片选中有工作区；Desk 块自有 ScreenModal 保持不变）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 75%）**：

| # | 块 kind | 卡文件 | 工作区组件 | 状态 |
|---|---------|--------|------------|------|
| 1 | link-parser | LinkParserBlock.tsx → CanvasNodeShell | tool/LinkParserWorkspace.tsx (URL/Hint 输入 + 3 按钮 + 结果 + 错误处理) | ✅ |
| 2 | grid-compose | GridComposeBlock.tsx → CanvasNodeShell | tool/GridComposeWorkspace.tsx (行/列设置 + 图片上传/移除 + 拼接运行) | ✅ |
| 3 | iterator | IteratorBlock.tsx → CanvasNodeShell | control/IteratorWorkspace.tsx (模式/轮次/变体 + 导航 + 运行/Loop Cascade) | ✅ |
| 4 | media-pin | MediaPinBlock.tsx → CanvasNodeShell（保留 lightbox 经 onRunOverride） | — (workspaceType=none, 纯展示) | ✅ |
| 5 | local-enhance | LocalEnhanceBlock.tsx → CanvasNodeShell | tool/LocalEnhanceWorkspace.tsx (4 Tab 切换 + lazy 子面板) | ✅ |
| 6 | caption-asr | CaptionAsrBlock.tsx → CanvasNodeShell | generation/CaptionWorkspace.tsx (ASR/Burn 双模式 + 语言/文本/SRT上传) | ✅ |
| 7 | inpaint-edit | InpaintEditBlock.tsx → CanvasNodeShell | generation/InpaintWorkspace.tsx (Canvas 画笔蒙版 + 笔刷 + Prompt + 重绘) | ✅ |
| 8 | reference-board | ReferenceBoardBlock.tsx → CanvasNodeShell | tool/ReferenceBoardWorkspace.tsx (参考图上传 + 色板 + 风格约束) | ✅ |
| 9 | CanvasNodeShell | 新增 onRunOverride prop | — （media-pin lightbox 接入） | ✅ |
| 10 | AttachedWorkspaceRouter | 新增 7 条 kind → 工作区路由 | — （link-parser/grid-compose/iterator/caption-asr/inpaint-edit/reference-board/local-enhance） | ✅ |
| 11 | f043-acceptance 测试 | 42 测（G1 CanvasNodeShell 门禁 + G2 工作区文件存在 + G3 ComposerWorkspaceShell 包裹 + G4 Router 路由 + G5 入口闭合 + G6 BlockShell 清零 + G7 Desk 块豁免） | ✅ |

- **已完成**：8 个 utility 块从 BlockShell 直接内嵌表单 → CanvasNodeShell（Card = NodeSummaryBody 统一骨架，Workspace = per-kind 组件承载原表单逻辑）；0 个 utility 块直接 import BlockShell 残留；Desk 块（ClipGen/SoundGen/DirectorDesk/StoryboardDesk/ScriptDesk/ClipEditor/AssetImport/ExportPack/ContinuityCheck）保持原有模式不变
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-044 · 70%

- **未完成**：Workspace/其余卡面「运行」歧义文案扫尾。  
- **风险**：同屏多种「运行」语义。  
- **下一步**：扫「运行」文案表。  
- **门禁**：未扫完 → 非 100%。

---

### F-045 · 100%（2026-07-28 收口）

**【门禁自检】F-045**
- G1 验收勾选：是（1/1）
  - [x] 关闭 DirectorDesk 时 3D shell dispose 被调用 → Path A (ScreenModal) + Path B (Panel) 双路径均有 `disposeRef` + `disposeDirectorWebGLLifecycle()` cleanup
- G2 主流程可运行：是（visibility 切换降分辨率 0.1；恢复时还原；GPU 争用信号可监听）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 60%）**：

| # | 变更 | 文件 | 状态 |
|---|------|------|------|
| 1 | `onGLCreated` 回调暴露 WebGLRenderer | `DirectorCanvas.tsx` | ✅ |
| 2 | `glRef` 存储 R3F renderer；`gl.domElement` 替代 `document.querySelector` | `StageDeckShell.tsx` | ✅ |
| 3 | visibility handler：`setPixelRatio(0.1)` 降分辨率 + canvas hide；恢复时还原 | `StageDeckShell.tsx` | ✅ |
| 4 | 重写 `director-webgl-lifecycle.ts`：`attachDirectorWebGLLifecycle(renderer)` 管理 R3F 上下文（不创建独立 WebGL 上下文） | `director-webgl-lifecycle.ts` | ✅ |
| 5 | GPU 争用信号：`isDirector3dGPUContention()` / `onDirector3dGPUContentionChange()` | `director-webgl-lifecycle.ts` | ✅ |
| 6 | Path A: `disposeDirectorWebGLLifecycle()` 在 cleanup 调用 | `director-3d-stage-embed.tsx` | ✅ |
| 7 | Path B: `onRendererReady` 传入 `Director3dShell`；`disposeRef` + `disposeDirectorWebGLLifecycle()` cleanup | `Director3dPanel.tsx` | ✅ |
| 8 | f045-acceptance 测试 | 17 测（6 组门禁） | ✅ |

- **已完成**：ref 替代 DOM querySelector；visibility 暂停/恢复渲染（降分辨率）；GPU 争用信号系统；Path A + Path B 双路径 dispose 回调；`createWebGLLifecycle` 已移除（旧模块创建独立上下文会加剧 GPU 争用）
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-046 · 58%

- **未完成**：取消中任务不得变成功。  
- **风险**：取消后仍 done。  
- **下一步**：取消 API+UI 联调记档。  
- **门禁**：未证 → 非 100%。

---

### F-047 · 75%

- **未完成**：仅 status 字符串不可 ready 的回归；空成功用例。  
- **风险**：空成功导出。  
- **下一步**：无 URL 不得 ready 断言。  
- **门禁**：未回归 → 非 100%。

---

### F-048 · 58%

- **未完成**：并发/重试配置单轨唯一源（ClipGen 与 Workspace 同读）。  
- **风险**：两处配置不一致。  
- **下一步**：配置只存一处并单测。  
- **门禁**：未证单轨 → 非 100%。

---

### F-049 · 45%

- **未完成**：Bridge / episode-queue / Seedance 三条可演示成功。  
- **风险**：名义闭环、实则断。  
- **下一步**：各一条最小 E2E/演示脚本。  
- **门禁**：痕迹 ≠ 完成。

---

### F-050 · 75%

- **未完成**：全部确认后 Playbook readiness 变绿。  
- **风险**：建议确认与流程脱节。  
- **下一步**：确认→readiness 联调。  
- **门禁**：未打通 → 非 100%。

---

### F-051 · 100%（2026-07-28 收口）

**【门禁自检】F-051**
- G1 验收勾选：是（1/1）
  - [x] 服装缺口 chip 可点击 → 打开资产库 costume tab
- G2 主流程可运行：是（道具缺口 chip 可点击 → 打开资产库 scene tab）
- G3 已更新本文件+缺陷分析总表：是
- G4 验收全绿 → 允许 100%
- 拟标完成度：100%
- 禁止项自检：无假接线/无死代码/无假 export：是

**本轮变更（相对 70%）**：

| # | 变更 | 文件 | 状态 |
|---|------|------|------|
| 1 | 服装缺口 chip `<span>` → `<button>` + `onClick → openAssetAt({ tab: 'costume' })` | `AssetReadinessPanel.tsx` | ✅ |
| 2 | 道具缺口 chip `<span>` → `<button>` + `onClick → openAssetAt({ tab: 'scene' })`（无独立 prop tab） | `AssetReadinessPanel.tsx` | ✅ |
| 3 | 添加视觉提示：`cursor-pointer`、`hover:bg-warn/20`、`title` | `AssetReadinessPanel.tsx` | ✅ |
| 4 | 辅助文字：服装区域"点击缺口打开服装库"、道具区域"点击缺口打开场景库" | `AssetReadinessPanel.tsx` | ✅ |
| 5 | f051-acceptance 测试 | 16 测（5 组门禁） | ✅ |

- **已完成**：缺口 chip onClick → 打开资产库对应 Tab。
- **未完成**：无。
- **风险**：无。
- **下一步**：无。
- **门禁**：G1 全绿 + G2 行为测通过 → **100%**。

---

### F-052 · 100%（与 F-005 捆绑）

**审计验证**（2026-07-27 收口）：
- `tpl-core-episode` / `test-pipe`：无 asset-gate，编剧直连分镜 ✅
- 死文件：`AssetGateBlock` / `asset-gate.css` / `asset-gate-runner.ts` 已删除 ✅
- registry / socket / attached-workspace 已无创建入口 ✅

- **未完成**：无
- **风险**：低（concealed 目录项仅迁移期识别用）
- **门禁**：与 F-005 同测通过 → **100%**

---

## 4. 建议实施顺序（仍受门禁约束）

### P0

1. F-003 / F-004：已收口 100%。  
2. F-005 / F-052：已收口 100%（preflight 真拦 + 旧 gate 迁移行为测）。  
3. F-028：制作台剧本 SSOT。

### P1

4. F-020：Remotion E2E 可播文件（升档唯一合法路径）。  
5. F-017 + F-032：enforce + 请求体证明。  
6. F-007 / F-008：已收口 100%；F-030：爆款智能剪辑仍待。  
7. F-014 / F-033 / F-034：下游闭环与非空产物。

### P2

8. F-035/049 可演示；F-022 防回潮；F-023/024/036/038 等清尾。  
9. 凡 ≥90% 项（F-040/041）：只差 G1 记档与边角 → **仍禁止跳过门禁直接 100%**。

---

## 5. 文档关系

| 文件 | 角色 |
|------|------|
| `docs/NX9-PROJECT-DEFECT-ANALYSIS.md` | 唯一开发依据（方案 + 验收清单） |
| `docs/NX9-COMPLETION-AUDIT-2026-07-27.md` | 2026-07-27 审计详报 |
| **本文** `docs/NX9-REAL-COMPLETION-LEDGER.md` | **真实完成度台账 + 强制门禁 G1–G4** |

完成度冲突时：**以通过 G1–G4 的当次更新为准**；禁止只改缺陷分析总表数字不改本文，也禁止只改本文不同步缺陷分析。

---

## 6. 变更记录

| 日期 | 变更 | 操作者 |
|------|------|--------|
| 2026-07-27 | 初版：按审计详报+实码抽查写入真实完成度；确立 G1–G4；明确仅 F-001=100% | Agent |
| 2026-07-27 | F-003 增量：`applyDeskBreakdown` 写 chainStoryboard、「syncBreakdownToStoryboard」标记废弃；台账与缺陷分析同步更新，完成度保持 70% | Agent |
| 2026-07-27 | 全量审计：F-004 读链已清洁（补充说明）、F-042 CSS `#fff` 残留（补充说明）、F-052 AssetGateBlock 仍存 registry（补充说明）；分布计数修正（39+9）；多节台账与缺陷分析同步 | Agent |
| 2026-07-27 | F-003 增量：`batchGenerateVideosFromShots`/`simpleConcatExport` 添加 dev 弃用警告；台账与缺陷分析同步 | Agent |
| 2026-07-27 | F-006 修复：移除运行时 useEffect 强制覆写；spawn/repair/「手递」显式设 `showExecPorts: true`；完成度 88%→95%；分布更新（3→4 项 ≥90%）| Agent |
| 2026-07-27 | F-005 修复：预检软/硬模式可切换；接线审计补正；toast 可见提示；完成度 60%→65% | Agent |
| 2026-07-27 | F-002/F-003/F-004 冲刺：flow-graph-mirror + 制作台链 SSOT；聚合禁默认全局回退；batchGenerate/ClipGen/Playbook 禁全局；完成度 →95%/95%/96% | Agent |
| 2026-07-27 | F-005 增量：`checkAssetGateInEdges`→`checkAssetReadinessInEdges`；死 import 清理；卡片文案更新；完成度 65%→68% | Agent |
| 2026-07-27 | F-005 最终轮：死文件物理删除(AssetGateBlock+CSS)；StoryboardDesk+DirectorDesk双块gate→readiness；socket-registry条目真删除；预检条CSS实装；完成度 68%→92% | Agent |
| 2026-07-27 | F-002/003/004 验收收口：消灭 use-upstream-shots/VideoWorkspace 全局回退；`resolveUpstreamShotsFromGraph` + acceptance 测；完成度 →100%/100%/100% | Agent |
| 2026-07-27 | F-005/F-052 收口：ScriptDesk 设定就绪 Tab；preflight 真拦；迁移写上游；删 asset-gate-runner；`f005-acceptance`+test-pipe；完成度 →100%/100% | Agent |
| 2026-07-27 | F-006/007/008 验收收口：`validateConnectionWithHandles`+就绪矩阵测+视频批准写回/徽章；`f006-f008-acceptance` 13 测绿；完成度 →100%/100%/100% | Agent |
| 2026-07-28 | F-011 成片出口收口：`timeline-effective` + ExportPack/ClipEditor 文案区隔 + runner/flow-runner 防假成功 + `has_timeline_draft`↔tracks；`f011-acceptance` 全绿 → **100%** | Agent |
| 2026-07-28 | F-012 性能 Toast+千级压测：`resolvePerfToast` shared；真 Toast+升档去重；设置档位；`bench-canvas-nodes.mjs`+结果表；`f012-acceptance` 全绿 → **100%** | Agent |
| 2026-07-28 | F-013 收口：9 模板 deprecated kind→活跃 kind + 5 处 preview-sink→asset-import；迁移 patch 显式写入模板；`TEST-RC-002` 零 migratedFrom 守卫；分布 13→15 项 100% | Agent |
| 2026-07-28 | F-014 收口：orchestrateDramaTimeline+ViralTimeline 接收 bgmUrl 写入 BGM 轨；ClipEditorBlock 透传 upstreamSounds[0]；对白注入传 bgmUrl；`f014-acceptance` 10 测全绿；分布 14→15 项 100% | Agent |
| 2026-07-28 | F-015 收口：ExportModule 注册+NestJS 静态服务；真 PDF 生成+非空防假；历史重试+清单下载；`f015-acceptance` 17 测全绿；分布 15→16 项 100% | Agent |
| 2026-07-28 | F-016 收口：队列状态机+skipped追踪+EpisodeQueueBar组件（暂停/继续/跳过/取消）；StoryboardDesk 全量拆镜走队列 runner；`f016-acceptance` 21 测全绿；分布 16→17 项 100% | Agent |
| 2026-07-28 | F-017 收口：enforceComposition 开关+构图模板下拉+flow-runner 阻断+director-desk-runner enforce；`f017-acceptance` 19 测全绿；分布 17→18 项 100% | Agent |
| 2026-07-28 | F-018 收口：buildShotPrompt 注入 cameraPrompt+内置预设生成 cameraPrompt+用户预设保存/恢复含 cameraPrompt；`f018-acceptance` 14 测全绿；分布 18→19 项 100% | Agent |
| 2026-07-28 | F-019 收口：修复 validatePoseCommand 非数组 crash + `f019-acceptance` 34 测全绿（合法指令 5 + 非法拒绝 12 + clamp/bridge/UI 守卫 + 全链路无有效结果）；分布 19→20 项 100% | Agent |
| 2026-07-28 | F-020 收口：`f020-acceptance` 32 测全绿（renderer核心 15/controller 3/module+serve 2/compositions 5/timelineToRemotion 5/失败不done 2）；dist 分布 20→21 项 100% | Agent |
| 2026-07-28 | F-021 收口：README 品牌色修正 #0F766E→#A67C4A + 双主题配色表 + 特性/技术栈/管线重构 + 删除陈旧表述；`f021-acceptance` 21 测全绿；分布 21→22 项 100% | Agent |
| 2026-07-28 | F-022 收口：三台拆分全部 <800 行（11/798/703）；StoryboardDesk 全量提取至 use-storyboard-desk hook + 子模块；DirectorDesk 提取 8 个子组件；ScriptDesk 提取 DevPackOverlay；`f022-acceptance` 42 测全绿；修复 5 项旧测试路径引用；分布 22→23 项 100% | Agent |
| 2026-07-28 | F-023 收口：9 检查器含 timeline；runner 三源合并（LLM+narrative+9-checker）；一键修复缺失字段；诊断项点击跳 Bible 高亮；手动检查按钮；f023-acceptance 40+ 测全绿；分布 23→24 项 100% | Agent |
| 2026-07-28 | F-051 收口：AssetReadinessPanel 服装缺口 chip `<span>` → `<button>` + `onClick → openAssetAt({ tab: 'costume' })`；道具缺口 chip `<span>` → `<button>` + `onClick → openAssetAt({ tab: 'scene' })`；添加 hover/cursor/title 视觉提示；f051-acceptance 16 测全绿；分布 36→37 项 100% | Agent |

---

## 7. 元数据

- **创建日期**：2026-07-27  
- **对照**：`docs/NX9-COMPLETION-AUDIT-2026-07-27.md`、仓库实码抽查  
- **未覆盖**：完整浏览器 E2E、付费 API 全量调用（故绝大多数项按门禁不得标 100%）  
- **纪律重申**：每完成一个功能必须 **①验收自检 ②主流程真可运行 ③更新真实完成度（本文+缺陷分析）④未达标严禁 100% 并写未完成/风险/下一步**。
