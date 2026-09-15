# NX9 操作复杂度分析与薄弱环节清单（2026-08-31 实测走查）

> 结论先行：**NX9 的复杂不是「功能多」造成的，而是「同一件事有太多入口、太多说法、太多地方」造成的。**
> 用户从「写完剧本」到「开始拆镜」需要 8 次手动操作；首次进入产品要经历 4 层选择（登录 → 工作面 → 模板 → 各台内部流程）；同一概念在不同台里有 2~3 个名字。本文档基于 2026-08-31 对 dev 环境的真实浏览器走查（注册新号 → 画布全流程 → 制作台），每一条结论都有实测证据与代码锚点。

---

## 一、走查方法

- 全新注册账号（首次用户视角），默认视口 1600×900。
- 路径：登录/注册 → 导航页 → 画布 → 选模板「AI 漫剧（核心流程）」→ 编剧台（粘贴成稿）→ 送到分镜台 → 分镜台拆镜（真实 LLM 通道）→ 导演台 → 设置 → 制作台。
- 服务端未配置有效余额的 LLM Key，拆镜/出图走真实失败路径——恰好验证了「失败诚实性」与错误引导质量。
- 仓库既有自动化基线：typecheck ✅、server 969 测 ✅、web 571 测 ✅、e2e 8/8 ✅、`verify:main-flow` ✅（2026-08-31 复跑）。**本清单聚焦自动化覆盖不到的操作体验层。**

---

## 二、复杂度根因（按影响排序）

### 根因 1：一次交接 = 8 次手动操作（流程碎片化，最大痛点）

「我写完了剧本，想拆分镜」实测操作序列：

1. 编剧台「上传成稿」→ 粘贴 →「写入成稿」
2. 导入预览 →「确认写入」
3. 「确认成稿」
4. 「送到分镜台」→ 弹 checklist →「确认送出」
5. 手动关闭编剧台（它不会自己关）
6. 找到/点开分镜台节点 →「打开分镜台」
7. 分镜台内点「从成稿拆镜」

**一次上下游交接被拆成 3 层确认 + 2 次开关弹窗**。`Product Optimization.md` 第 14 条「没有自动推进流程」完全成立：每一步都有按钮，但没有一步自动带走用户。亮点是「确认成稿」后按钮自动变「送到分镜台」——这个「按钮即下一步」的模式应该推广到全链路，而不是每步之后再弹一层确认。

### 根因 2：四层入口选择，选择过载

首次使用要连续做 4 次「选择」才能开始创作：

| 层 | 选项数 | 问题 |
|---|---|---|
| 登录页 | 登录/注册 | 本机无登录史默认「注册」Tab（P2-1） |
| 导航页 | 画布 / 制作台（兼容） | 两条全功能范式让新用户二选一，「兼容」「传统通告台」是开发视角词汇 |
| 画布模板 | 11 个模板 + 空白 + Recipe | AI 漫剧就有 3 个变体（核心/3D/动漫），「预计 40 分钟」是压力数字 |
| 各台内部 | 编剧台 4 条创作路径；分镜台 4 子步；导演台 3 子步 | 台内又有独立流程条 |

PRD 第 3 条「信息密度过高」、第 14 条「自动推进」在这里集中体现。**建议**：首用只保留一条主干（AI 漫剧核心流程），其余模板收进「进阶」。

### 根因 3：同一概念多个名字（术语过载）

实测同一句话在不同位置的叫法：

- 上游成稿同步：**「同步最新成稿」**（分镜台横幅）/ **「只拆新增 N 集」**（拆镜队列按钮）/ 编剧台提示又说 **「只拆新增」**（见 bug P1-2）
- 成稿状态：草稿 → 已确认 → **「分镜落后于成稿」**（编剧台节点卡）→ 分镜台侧叫 **「未确认」**——同一件事两个方向各说一遍
- 弹窗关闭按钮每个台有 **两个**：「关闭」+「关闭 (Esc)」
- 用户必须学习的自造词：共创、意图、成稿、稿纸、诊断、抽取设定、设定就绪、批出、交接、拆镜、号池

新用户第一屏（编剧台）就要消化约 30 个可交互控件 + 10 个新术语。PRD 第 8 条「节点全部像后台表单」成立。

### 根因 4：三个工作面 + 每节点全屏工作台，但彼此不能穿越

- 顶层 `AppSurface = home | studio | canvas`（`apps/web/src/stores/app-surface.ts`），导航页让用户选。
- 画布内每个节点打开**全屏弹窗工作台**；实测「送到分镜台」后两个全屏弹窗叠开（bug P0-1）；编剧台开着时顶部步骤条被遮住，**台与台之间无法直接跳转**，必须关闭→找节点→再打开。
- 顶部「步骤进度」条点击只平移画布并压暗节点，**不打开目标台**，且压暗效果会卡住（bug P1-4）——PRD 第 4 条「顶部步骤只是 UI」仍成立。

### 根因 5：画布布局与视口

- 初始视口只显示一半流程链（视频生成/剪辑/导出在屏幕外），没有自动 Fit View。
- 「图像生成」节点初始位置**压住「分镜台」节点**（模板摆放问题，实测两处复现）。
- Fit View 后 7 个节点全部小到不可读。PRD 第 10 条「画布利用率低」成立，需要自动布局 + 分组折叠。

### 根因 6：制作台与画布是两套完全不同的产品

制作台（NX9 Atelier）是木质桌面/便签/拍立得隐喻 + 另一套顶栏/底部 Dock（新建镜头/导入剧本/素材库/技能库/角色库/场景库/镜头库/预览播放），还有画布上不存在的「项目进度 14%」。同一个项目、两套操作语言、两处「导入剧本」入口。虽然标注「同数据同源」，但用户感知是**两个产品**，学习成本 ×2。与 PRD「工作流 → 故事板」的方向相反——这是三套隐喻（节点图 / 场记桌 / 全屏台）并存。

### 根因 7：失败后的现场丢失（错误引导弱）

实测 LLM 通道 401（余额不足）时：

- 拆镜失败后视图**自动跳到「本集暂无镜头」空态页**，失败原因（含具体 401 文案）藏在「拆镜」页的队列里，用户必须自己点「去拆镜」才看得到原因。
- 空态文案只说「请先完成拆镜」，不告知刚才那次拆镜失败了。
- 设置里的连接叫「OpenCode Go / 号池图片 / whatstoken」——内部代号直接暴露；401 报错后没有任何「去设置 → 连接 → 修复」的深链引导。
- 诚实性 ✅：失败是真实的，没有假成功（`gateway-music-honesty` / `hyperframes-honesty` 等测试守护）；问题只在引导。

---

## 三、薄弱环节清单（本次实测发现）

### P0 — 直接卡住主流程

| # | 问题 | 证据 / 锚点 | 状态 |
|---|---|---|---|
| P0-1 | 「送到分镜台」确认后**分镜台弹窗叠在编剧台上方**，两个全屏弹窗同开；编剧台的关闭按钮被上层遮挡不可点（无障碍点击被拦截）；用户失去层级感 | `use-storyboard-desk.tsx:501-507`（分镜台自开）+ `use-script-desk-actions.ts:232-270`（编剧台不关自身） | **本次修复** |
| P0-2 | ~~拆镜失败后跳空镜表~~ → 失败停拆镜页 + `lastBreakdownError` | `use-storyboard-desk` / `grid-panel` |

### P1 — 明显误导/磨损

| # | 问题 | 证据 / 锚点 | 状态 |
|---|---|---|---|
| P1-2 | 跨台提示文案错误：首次送分镜后提示「请在拆镜页点『只拆新增』」，但空分镜台上按钮实际叫「从成稿拆镜」（同弹窗内另一条提示又说对了） | `use-script-desk-actions.ts:260` 硬编码；对比 `:1001`（正确分支）与 `use-storyboard-desk.tsx:528`（空台走「从成稿拆镜」） | **本次修复** |
| P1-4 | ~~步骤条卡死~~ → 点击步骤 = 平移 + `openDeskAt` 打开对应台 | `use-open-desk-signal` / FlowSurface |
| P1-5 | ~~图像节点压住分镜~~ → 模板 `DY=420` + 加载后 fitView | `workflow-templates.ts` / FlowSurface |

### P2 — 新用户引导/文案

| # | 问题 | 证据 / 锚点 |
|---|---|---|
| P2-1 | ~~登录页对新用户显示「欢迎回来」~~ → 本机无登录史默认注册 Tab | `LoginPage.tsx`（`nx9.hasSignedIn`） |
| P2-2 | ~~导航页「制作台（兼容）」开发词汇~~ → 已改为「制作台 / 场记桌视图」 | `HomeNavPage.tsx` |
| P2-3 | ~~设置连接 Tab 暴露内部代号~~ → 模态用文字/图片/视频/音频；预设「本地视频桥（开发）」 | `SettingsModal` / `BUILTIN_CONNECTION_PRESETS` |
| P2-4 | ~~制作台「AI 智能拆镜」对比度~~ → `--at-*` 变量兜底（见 §3·五） | Atelier dock |
| P2-5 | ~~导演台空态暴露 40+ 参数~~ → 无镜隐藏出图条/批出主控；高级参数折叠 | `director-main-panel` / `director-settings-drawer` |
| P2-6 | ~~空镜表过早横幅~~ → 0 镜不弹 stale；handoff 残留不自动开台 | `stale-banner` |
| P2-7 | 画布节点卡按钮频繁重渲染，快速点击偶发无效（自动化表点击等待 stable 超时，e2e 出现 1 次 flaky，人工走查同样复现，需原生 click 才命中） | e2e `打开导演台` 点击超时重试后通过；节点卡片应稳定 key，避免轮询数据触发整卡重挂 |

### 亮点（保持并推广）

- 导入成稿的「导入预览」准确识别分集字数后才写入——好设计。
- 「确认成稿」成功后主按钮自动变「送到分镜台」——按钮即下一步，应成为全链路统一模式。
- 失败诚实性有测试守护（假成功被禁止）；拆镜队列按集显示具体上游错误。
- 项目自动创建「我的第一部剧」，减少一步冷启动。

---

## 三·五、第二轮修复与回归（2026-09-04，无需 LLM 的细节 bug 专项）

**已修复并浏览器实测验证：**

| 项 | 修复内容 | 验证 |
|---|---|---|
| P0-1/P1-2（上轮） | 弹窗叠层 + 跨台文案 | 上轮已验 |
| P1-4 | **步骤条即导航**：点击任一步骤 → 定位节点 + 通过 `openDeskAt` 信号直接打开对应全屏工作台（编剧/分镜/导演/剪辑四台）；error 态不再无动作。实测：点「2 分镜台」直接开出分镜台 | ✅ 浏览器 |
| P1-5 | 模板行距 `DY 120→420`（同列节点重叠的系统性根因：120px < 卡片高 300px）；模板加载后自动 fitView，整链第一眼可见 | ✅ 新项目实测 |
| P0-2 | 拆镜队列**全败时抛错**，外层走 fail 分支留在拆镜页（此前被当作成功甩到空镜表页）；部分失败 push error toast 写明 成功/失败 计数 | ✅ 代码+类型收口 |
| P2-6 | 空镜表（0 镜）不再弹「本集镜表/线稿已变更，确认状态已撤销」横幅（effect + 渲染双重守卫）；**handoff 持久化导致的重载自动开台**一并修掉（`handoff.at ≤ 挂载时刻` 视为残留） | ✅ 浏览器 |
| P2-4 | 制作台「AI 智能拆镜」白字浅底（Atelier 侧栏不在 `.studio-desk` 作用域，`--sd-*` 变量缺失）→ 用 `--at-*` 变量兜底补齐主/次/幽灵按钮样式 | ✅ 截图可见 |
| **新发现** | 素材库与技能库可**同时叠开**（两个独立 toggle 无互斥）→ AppShell 层互斥：打开一个收起另一个 | ✅ 浏览器 |

**P2-7 重新定性（非产品缺陷）**：画布点击不稳定（自动化与人工都复现）的根因是 **Vite HMR**——空闲状态下 MutationObserver 实测 3 秒 **0 次 DOM 变更**，页面完全静止；e2e 的 flaky 全部发生在源码编辑进行中（HMR 推送引发全树重渲染）。无需改产品代码；回归期间不改文件即 8/8 全绿无 flake，佐证成立。

**非 LLM 面板扫测结论（2026-09-04）**：命令面板（搜索/配方/Playbook）、技能库（31 个内置 Skill）、素材库（5 Tab + 回收站抽屉 + 健康细则）、设置-用量（空态诚实）、导出交付工作区（文件名/混音 URL/拼接导出，空链正确 disabled）、空链「运行」（编剧台 401 诚实 error、下游保持 idle 不假成功）——**功能全部可用，未发现新的假入口**。

**回归（2026-09-04 第二轮）**：typecheck ✅ · server 969/969 ✅ · web 571/576 ✅ · e2e 8/8 ✅（零 flake）· 生产构建 ✅（注：构建前需停 dev server，Windows 下 Prisma 引擎 DLL 会被运行中进程锁定导致 EPERM，属环境锁非代码缺陷）。

---

## 四、全流程测试结果（2026-08-31）

| 检查 | 结果 |
|---|---|
| `pnpm run typecheck`（shared/server/web） | ✅ |
| server 单测 | ✅ 969/969 |
| web 单测 | ✅ 571/576（5 个按设计跳过） |
| 生产构建 | ✅ |
| e2e 全量（8 场景） | ✅ 8/8 |
| `pnpm run verify:main-flow` 验收总闸 | ✅ |
| 真实浏览器走查（本档） | 发现 P0×2 / P1×3 / P2×6，P0-1 与 P1-2 已随本档修复 |

环境性失败（非产品 bug）：当前配置的 LLM 通道余额不足（401 Insufficient balance），拆镜/出图/出片无法真实完成；失败路径行为诚实、无假成功。

---

## 五、建议的收敛路线（对齐 PRD 原则「先闭环，再扩展」）

1. **一条主干贯穿**：把「按钮即下一步」做到底——确认成稿且设定就绪 →（`autoAdvanceEnabled` 默认）自动送到分镜台并关编剧台 → 自动拆镜（预检通过时免确认）→ 拆完自动进镜表。有设定缺口时停在就绪页；补齐为就绪后再自动送出。→ **已落地**（`handoffRunnerRef` + `readiness.ready`；就绪变更亦触发；手动「送到分镜台」软模式可带缺口送出；关闭自动推进时保留 checklist）
2. **错误就地可见**：任何台内失败停留在触发页显示原因，附「去设置修复连接」深链。→ **已落地**（拆镜失败 toast + 拆镜页/空镜表 CTA → `openSettingsTo('connection')`）
3. **首用单车道**：未完成第一部剧前，导航页/模板页只呈现「AI 漫剧核心流程」一条路。→ **已落地**（`first-lane.ts`：RecipePicker / Templates / CommandPalette；导出成功或点「解锁」放开）
4. **步骤条真导航**：点击步骤 = 平移 + 打开对应台（等价于现在「打开XX台」按钮），压暗仅瞬时动画。→ **已落地**（`openDeskAt`）
5. **术语统一表**：同步/只拆新增/从成稿拆镜合并为一个动词；节点卡状态与台内状态共用一套词。→ **已落地**（`breakdown-labels.ts`：主 CTA 统一为「拆镜 / 拆镜 · 同步 / 拆镜 · 新增 N 集」）
6. **渐进披露专业参数**：导演台/出图参数默认折叠进「高级」，空态只留一个主按钮。→ **已落地**（P2-5）

### 2026-09-11 追加 · 剪辑编排诚实门禁

漫剧「AI 编排」在 `approvedOnly` 滤空（视频均未批准）时**不再返回成功空时间线**；改为明确错误「请先在视频工作区批准」。剪辑台 `arrangeHint` 同步提示待批准镜数。验收：`dd01-video-gate.test.ts`。

连贯性检查卡面与画布 Run 共用 `parseContinuityLlmJson`，解析失败不假装零问题。关键帧评分去掉默认 85 假高分（解析失败记 0）。验收：`dr04-continuity-parse` / `storyboard-preview-score-honesty`。

爆款复刻 `replicateVideoPlan` 解析失败 / 空内容时 `ok:false`；`chat-model` 空回复与 `clip-sink` 无视频禁止空成功；反推/风格提取/宫格 Vision/`analyzeFaces` 解析失败诚实失败。验收：`vision-tools.service.spec` / `tool-empty-success-honesty` / `grid-reverse-honesty`。

剪辑台：上游视频全未批准时禁用「AI 编排」并提示去视频工作区批准（`orchestrateBlockedReason`）。`picture-diff` / `enhanceMode=diff` 下线空成功假绿。

### 2026-09-11 追加 · 工具/媒体 ops 空成功扫尾

画布 Run：`cinema-prompt` / `tag-atelier` / `shot-script` / `reference-board` / `reference-analyze` / `prompt-diff` 空文本或空 LLM 结果一律 throw；宫格拆合、缩放、合并、封面、ASR、放大、去元数据、文本切分、资产导入校验 `ok`/非空；Topaz / ControlNet / Fal / 本地增强同门禁。卡面 Run（BgRemove / Upscale / Watermark / Topaz）同步校验。`synthesizeTts` / `runInpaintEdit` 空 url 禁止空成功。连贯性卡面解析失败状态标「解析失败」且问题 tone 不标 ok。验收：`tool-empty-success-honesty` / `utility-block-ok-honesty` / `sound-gen-runner` / `inpaint-continuity-honesty` / `deep-open-loops-regression`。

### 2026-09-11 追加 · 工作区 UI 空成功扫尾

`link-parser` ops + `LinkParserWorkspace`：解析无 prompt / 采集无 url / 导入空 items 禁止 success。`CaptionWorkspace` ASR 与 media-ops 对齐（空 SRT 失败）。`GridComposeWorkspace` / `MediaPin` 图层分离 / `ExportPack` 单集合成无 URL 同门禁。验收：`tool-empty-success-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 追加 · 连贯性假绿 + 链接解析双端门禁

连贯性（ops + 卡面）：LLM JSON 解析失败时 `status=error` + `continuityParseFailed`，禁止假绿 success。服务端 `link-parser` 空 prompt 抛 `PARSE_EMPTY`。剪辑台 SmartReplace 局部重绘/图像编辑校验 `ok`+url。`export-pack-runner` ffmpeg-episode 无 URL 禁止 `ok:true`。验收：`inpaint-continuity-honesty` / `link-parser-honesty` / `utility-block-ok-honesty` / `export-pack-honesty`。

### 2026-09-11 追加 · 生图/出片空成功门禁

`picture-gen-runner`：高清 / Fal / 网关图生校验 `ok`+url。`clip-gen-ops`：级联与导演批出无视频禁止 success；Bridge 抽帧校验 `ok`+frames。验收：`picture-gen-runner-honesty` / `vg-honesty`。

### 2026-09-11 追加 · 服务端 ASR 空 SRT

`montage.service` 转写结果空文本抛错，禁止 `ok:true`。与前端 CaptionWorkspace / media-ops 双端对齐。验收：`transcribe-honesty`。

### 2026-09-11 追加 · 宫格/联系表空产物

`grid.service` 宫格生成与单镜线稿无 url 抛错；`createContactSheet` 空镜头返回 `ok:false`；`photoSpeak` 校验 TTS ok+url 与成片落盘；`mixAudio` / `colorGrade` / `speedPitch` 校验产物落盘。验收：`grid-contact-honesty`。

### 2026-09-11 追加 · 简单导出 / 故事板大图假绿

`simpleConcatExport` 无成片 URL 禁止写 success；分镜台 `sheet-export-ops` 上传无 url 禁止写回联系表。验收：`export-pack-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 追加 · 渲染/拼接产物落盘

`renderShot` / `concatEpisode` / `concatClips` / 联系表写盘后校验文件存在；ExportPack 成片模式 `exportReady` 无 URL 禁止假绿。验收：`grid-contact-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 追加 · image-ops / HF / 素材采集落盘

`image-ops` 缩放/拼贴/放大/去元数据/封面写盘后 `existsSync`；`hyperframes.renderer` 成片未写出 → `ok:false`；画布 `export-pack` 链 HF poll / `exportReady` 无 URL 禁止 success；`tools` capture-url / proxy-download 拒空 buffer 并校验落盘。验收：`grid-contact-honesty` / `export-pack-honesty`。

### 2026-09-11 追加 · 剪辑轮询 done 无 URL

`pollMontageTaskUntilDone`：HyperFrames / Remotion 标 `done` 但无输出地址时立即 throw（不再空转到超时）。资产上传拒 `size===0`。验收：`clip-editor-render` / `grid-contact-honesty`。

### 2026-09-11 追加 · beat-sync 真听音 + 空池 / 宫格落盘

`beat-sync` 画布 Run：优先 `beatAnalyze`（`energy-onset` / `listenedToAudio:true`）；失败才 BPM 估切并写明听音失败。`iterator` / `picker` 空池 → `skipped`。宫格拆合、深度通道、Topaz 图/视频写盘后校验文件存在。验收：`dr05-beat-sync-honesty` / `loop-executor` / `grid-contact-honesty`。

### 2026-09-11 追加 · 图层分离 / 视频编辑 / 网关落盘

`separateLayers`、video-edit 远程落盘、网关图生/视频落盘拒空 buffer 并校验文件存在；缩略图写盘失败返回 null。验收：`grid-contact-honesty`。

### 2026-09-11 追加 · 3D/场面调度/Remotion 包/清单落盘

`director-3d` / `blocking-stage` 无提示与截图禁止 success；`remotion-bundle` 空文件包 `ok:false`；分镜预览/全景无 URL 明示禁止空成功；导出清单 CSV/HTML/PDF 写盘后校验。验收：`tool-empty-success-honesty` / `export-pack-honesty` / `grid-contact-honesty`。

### 2026-09-11 追加 · 编剧台 / Agent 空成功

续写全败不得节点 `success`；Agent 技能无 patch/文本、重写无补丁禁止空成功。服务端 `extractEnvironments` 空卡、`materializeShots` 空表、`adaptation` JSON 解析失败诚实失败。验收：`script-desk-sse` / `agent-honesty`。

### 2026-09-11 追加 · 任务轮询 / 资产抽取

`useTaskPoll`：`done` 无 URL → `error`（ExportPack 随之标错）。`extractAssets`：JSON 解析失败或角色+场景皆空 → 禁止 `ok:true`。验收：`use-task-poll-honesty` / `agent-honesty`。

### 2026-09-11 追加 · 视频轮询 success 无 URL

`pollVideoUntilDone`：上游标 `success` 但无 url 立即 throw（不再空转到超时）。验收：`poll-task-honesty`。

### 2026-09-11 追加 · TTS / Remotion 空音频空成片

LuxTTS / Voicebox 拒空 buffer；`saveAudioBuffer` 拒空并校验落盘；前端 `synthesizeTts` 拒 `bytes<=0`；Remotion 缺文件/空文件明示禁止空成功；编剧 `scriptSkill` JSON 解析失败诚实失败。验收：`tts-remotion-honesty` / `sound-gen-runner`。

### 2026-09-11 追加 · Fal / Comfy 无图落盘

`proxyFal` 无图片 URL → `ok:false`（禁止裸 `ok:true`）；`saveRemoteImage` 拒空 buffer；Comfy 写盘跳过空文件。验收：`fal-comfy-honesty`。

### 2026-09-11 追加 · Gemini / 规则拆场

`saveInlineImage` 拒空 base64 / 空解码 / 未写出；`sceneSplit(mode=rule)` 无场次禁止 `ok:true`。验收：`gemini-honesty` / `agent-honesty`。

### 2026-09-11 追加 · 视频轮询 success 无 URL（UI）

ClipGen / VideoWorkspace / `resumePendingVideoTasks`：上游 `success` 但无 url → `error`/`failed`，不得伪装「仍在生成」。验收：`video-poll-empty-url-honesty`。

### 2026-09-11 追加 · BGM / 智能替换 done 无 URL

BGM 网关 done 无音频 → `error`；前端 poll 立即失败；SmartReplace / SSE 同口径。验收：`gateway-music-honesty` / `bgm-replace-empty-url-honesty`。

### 2026-09-11 追加 · 空产物文案统一

导演关键帧 / 线稿宫格 / 资产库出图 / 剪辑空轨 / 拆镜空结果 / Agent 空白 LLM 统一「禁止空成功」。验收：`empty-artifact-copy-honesty` / `agent-honesty`。

### 2026-09-11 追加 · 编剧分镜流式空正文 + 深度视频落盘

API/编剧台/分镜拆镜空正文拒成功；`convertDepthVideo` 写盘后校验文件；Gemini 无图文案统一。验收：`script-storyboard-empty-honesty` / `grid-contact-honesty` / `gemini-honesty`。

### 2026-09-11 追加 · 定妆截图 / 空配音输入

FaceSculpt 定妆截图空 dataUrl/空 blob/上传无 URL 拒成功；批出无视频 URL、空时间线编排、配音空输入同口径。验收：`face-sculpt-empty-honesty`。

### 2026-09-11 追加 · 空输入与参考反推

Workflow/字幕/链接/Prompt 空输入拒跑；`analyzeReference` 空镜表 `ok:false`；复刻内容全空带禁止空成功。验收：`empty-input-honesty` / `analyze-honesty`。

### 2026-09-11 追加 · Magic Hour 完成无地址

MH 图/视完成无下载地址、落盘失败、通用视频完成无 URL、Gemini 网关空 urls 均禁止空成功。验收：`magic-hour-honesty`。

### 2026-09-11 证据清单（非通道诚实收口）

| 类别 | 证据 |
|------|------|
| 缺陷表非 100% | 仅 F-034/035/049（通道）；`channel-demo-honesty` 防虚标 |
| 素材库 UX | `NX9-ASSET-LIBRARY-UX-RESIDUAL.md` §1–2：P0–P2 已真闭环 |
| 分镜台 OL | `NX9-STORYBOARD-DESK-OPEN-LOOPS.md` 实施进度表 SB-OL-01～23 均为 ✅ |
| 短片 SF | SF-01～10/14～20 代码齐；SF-11 通道台账；SF-12/13 文档边界后置 |
| 诚实测例族 | 2026-09-11 续：server `vitest run honesty` → 16 文件 / 59 测绿；web → 22 文件 / 92 测绿；含 `url-path-honesty` + `channel-demo-honesty` |
| 通道真机 | F-034/035/049/SF-11 保持诚实不阻塞，不标 100%（见 `REAL-PROVIDER-VALIDATION.md`） |
| 穷尽扫（抛错文案） | web/server「为空/未返回/无有效/产物」类 throw 已统一带「禁止空成功」（昵称/prompt 入参校验除外）；复扫空集 |

### 2026-09-11 追加 · 提交缺 id / 清单空内容

宫格无有效图、Fal/Comfy/MH 缺 id、export-manifest 空 CSV/HTML/PDF 输入统一禁止空成功。验收：`magic-hour-honesty` / `grid-contact-honesty`。

### 2026-09-11 追加 · 烧录 / 导出 / 轮询兜底文案

字幕烧录（tool-ops + CaptionWorkspace）、深度通道、FFmpeg/Remotion 提交、awaitProxyVideo、智能替换提交、电商包/ZIP 空媒资、BGM 缺 taskId、图像批失败兜底、client 导出失败，统一「禁止空成功」。验收：`tool-empty-success-honesty` / `caption-render-honesty` / `export-pack-honesty` / `poll-task-honesty` / `bgm-replace-empty-url-honesty` / `gateway-music-honesty`。

### 2026-09-11 追加 · tasks done 无 URL / 清单客户端 / Bible 出图

`TasksService.pollVideoTask` 在 `done` 无 url 时立即 failed（禁空转超时）；export-manifest-client 校验响应 url；Bible 定妆/场景出图与 BGM 失败兜底统一禁止空成功。验收：`tasks-honesty` / `manifest-bible-task-honesty`。

### 2026-09-11 追加 · Agent 空解析 / Skill 空正文 / Fal 提交

对白/分镜/场次/事件/骨架空结果、Skill 注入正文为空、Fal 上传/提交失败、BGM HTTP 提交失败统一「禁止空成功」。验收：`agent-honesty` / `skills-fal-honesty`。

### 2026-09-11 追加 · watchVideoTask SSE 回退 / montage 空片段

`watchVideoTask` 从 `url`/`result.url` 取产物；SSE onerror 仅终态 settle，禁盲 resolve；montage 无片段/口播空/TTS 未落盘/编排 JSON 空解析、复刻空链接统一禁止空成功。验收：`watch-video-task-honesty` / `bgm-replace-empty-url-honesty` / `grid-contact-honesty`。

### 2026-09-11 追加 · Gemini 仅文本 / 路径解析 / URL 抽取

Gemini generateContent/Interactions「仅文本」分支、复刻 JSON 解析失败文案统一「禁止空成功」；`extractUrlFromText` 空输入/无链接、网关/宫格/image-ops/montage 路径不可解析、图层无边界、深度源视频不可读同口径。验收：`gemini-honesty` / `skills-fal-honesty` / `url-path-honesty` / `grid-contact-honesty` / `vision-tools.service.spec`。

### 2026-09-11 追加 · 无法读取源媒体 / 音效对白空输入

montage/image-ops/Topaz/Magic Hour/网关参考图「无法读取*」统一禁止空成功；media-ops 音效无导入、对白空列表同口径。验收：`url-path-honesty` / `magic-hour-honesty` / `face-sculpt-empty-honesty`。

### 2026-09-11 追加 · media-ops 缺输入 / BGM 空描述 / 镜表空诊断

media-ops 缺图/缺视频/缺时间线/混音调色缺上游、voice-cast 空对白；sound-gen 空对白与空 BGM 描述；编剧 Bible 空成稿、分镜空镜表诊断、预览评分 JSON 不可解析统一「禁止空成功」。验收：`tool-empty-success-honesty` / `empty-input-honesty` / `script-storyboard-empty-honesty`。

### 2026-09-11 追加 · tool-ops 缺参考 / Fal 缺 request_id / 导出缺上下文

tool-ops 缺参考图/视频/宫格图、export-pack / 导演关键帧缺画布上下文、Agent 骨架缺必填字段、Fal 排队缺 request_id 统一禁止空成功。验收：`tool-empty-success-honesty` / `export-pack-honesty` / `vg-honesty` / `agent-honesty` / `skills-fal-honesty`。

### 2026-09-11 追加 · Bible 抽空文本 / ControlNet / BGM 空描述 / 分层失败

编剧人物场景抽取缺文本、ControlNet/参考反推缺上游、ZIP 缺 workspace、画布创建失败、BGM 空描述、Gemini/Imagen 空 prompt、Agent 无法分集、图层过小/无背景色统一「禁止空成功」。验收：`script-storyboard-empty-honesty` / `tool-empty-success-honesty` / `empty-input-honesty` / `skills-fal-honesty` / `gemini-honesty` / `agent-honesty` / `url-path-honesty`。

### 2026-09-11 追加 · 剪辑编排空时间线写回 / 拆镜队列空 payload

ClipEditorBlock 编排前校验上游；编排后无 tracks 拒 success，并同步写回 `timelineDraft`；拆镜队列 API 空 payload、智能替换超时、回收站失败同口径。验收：`clip-editor-render` / `bgm-replace-empty-url-honesty` / `script-storyboard-empty-honesty`。

### 2026-09-11 追加 · SoundGen 空配音 / Canvas / Skill 校验

SoundGenBlock 空文本/缺 LuxTTS 参考拒跑，成功前再验 audioUrl；裁剪/清晰度 Canvas 不可用；Skill frontmatter 缺 name/description 与空目录同口径。验收：`bgm-replace-empty-url-honesty` / `empty-input-honesty` / `skills-fal-honesty`。

### 2026-09-11 追加 · Skill metadata 阈值对齐 / Bridge·导演锁参考

Skill `description` 校验改为真实 `length < 20`（与「≥20 字」文案一致）；metadata/SKILL/examples 缺失文案统一禁止空成功；Bridge 续拍缺源视频、导演锁参考未就绪、回收站项不存在同口径。验收：`skills-fal-honesty` / `vg-honesty`。

### 2026-09-11 追加 · 拼贴空图 / 视频编辑入参 / 字幕空上游 / 导出无时间线

image-ops 拼贴无有效图、video-edit 缺 videoUrl/prompt/mask、Remotion 无效时间线、字幕 ASR/烧录缺上游或空文本写 error、链接解析空 URL、export-pack 无时间线/无链镜表统一「禁止空成功」。验收：`grid-contact-honesty` / `skills-fal-honesty` / `caption-render-honesty` / `export-pack-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 追加 · Vision 反推/风格 / ExportPack 卡面门禁 / 表情分析

Vision reversePrompt/extractStyle/analyzeFaces 解析失败与快捷分镜空结果统一禁止空成功；ExportPackBlock 无时间线/无链镜表写 error；MediaPin 表情分析失败同口径。验收：`vision-tools.service.spec` / `utility-block-ok-honesty` / `media-pin-analyze-faces-honesty` / `f011-acceptance`。

### 2026-09-11 追加 · 3D 提交 / 关键帧门禁 / 模型列表空响应

director3d 缺持久化图/上游链、clip-gen 关键帧门禁缺画布、导演写回缺适配器、网关模型列表空响应统一「禁止空成功」。验收：`empty-artifact-copy-honesty` / `director3d-commit-adapter` / `director-desk-runner` / `fal-comfy-honesty`。

### 2026-09-11 追加 · 工具卡空上游写 error / montage FFmpeg 文案

BgRemove/Upscale/Watermark/Topaz 缺上游写 `status:error`；montage 残留 FFmpeg/混音轨不足文案统一禁止空成功。验收：`utility-block-ok-honesty` / `hyperframes-honesty`。

### 2026-09-11 追加 · 审片包空镜表 / 参考视频不可访问

分镜审片包无镜表拒导出；analyze 探针无法访问视频同口径禁止空成功。验收：`utility-block-ok-honesty` / `analyze-honesty`。

### 2026-09-11 追加 · 连贯性不足图 / 配音空对白 / 单集合成空链

ContinuityCheck 不足 2 图、VoiceCast 空对白、ExportPack 单集合成无链镜表均写 error + 禁止空成功。验收：`inpaint-continuity-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 追加 · 分镜台空前置 / 预览缺图生 / 设定板裁切

拆镜缺成稿包、线稿/故事板缺图生或空镜、交接无上游编剧、预览缺图生/全景描述/关键帧、设定板裁切无图统一禁止空成功。验收：`script-storyboard-empty-honesty` / `storyboard-preview-score-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 追加 · 导演批准/推送空前置 / 五类原图

导演缺关键帧批准、无 clip-gen、无可交付关键帧、设定板五类原图缺完整板、预览无可重生分镜统一禁止空成功。验收：`vg-honesty` / `empty-artifact-copy-honesty` / `storyboard-preview-score-honesty`。

### 2026-09-11 追加 · 线稿空队列 / 导演勾选 / 剪辑对白注入

线稿无可生成或无需补、导演未勾选/无失败镜/写回失败、剪辑无对白可注入、FlowSurface 无关联镜头统一禁止空成功。验收：`script-storyboard-empty-honesty` / `vg-honesty` / `clip-editor-render`。

### 2026-09-11 追加 · 拆镜增量空输入 / 模型列表默认失败文案

增量补拆空文本、无新镜、无新增集、无需重拆；网关模型列表默认失败与 montage 缺 workspaceId 同口径。验收：`script-storyboard-empty-honesty` / `fal-comfy-honesty`。

### 2026-09-11 追加 · 局部重绘空前置 / 宫格空图 / 导演审片空导出

Inpaint 无图/空 prompt/无蒙版、宫格拼接无图写 error、导演撤回/打回/导出关键帧 URL 空前置、连贯性无上游分镜台同口径。验收：`inpaint-continuity-honesty` / `utility-block-ok-honesty` / `vg-honesty` / `clip-editor-render`。

### 2026-09-11 追加 · tool-ops 上游缺省 / Comfy 空 JSON / 参考不可拍

tool-ops 缺上游视频/图像、Comfy 未填 JSON、标签工坊无上游图；导演参考/定妆缺失阻止批出同口径。验收：`tool-empty-success-honesty` / `vg-honesty`。

### 2026-09-11 追加 · legacy 混音调色 / story-ops 连贯性空前置

legacy-honesty-ops 混音/调色/双路 prompt 空前置；story-ops 连贯性不足图与缺音频统一禁止空成功。验收：`tool-empty-success-honesty` / `inpaint-continuity-honesty`。

### 2026-09-11 追加 · 图生/分镜成稿 / 智能剪辑空镜头 / 网关空视频 base64

图生多图空提示与放大/高清缺参考图、分镜未确认成稿包、智能剪辑无可编排镜头、网关视频空 base64 统一禁止空成功。验收：`picture-gen-runner-honesty` / `script-storyboard-empty-honesty` / `se-deep-honesty` / `magic-hour-honesty`。

### 2026-09-11 追加 · 重绘/拆镜/BGM 配置 / Agent 最短文 / 网关视频配置

`inpaint-edit` 缺图与空 prompt、拆镜原文/分集空、BGM 未配置、Agent 不足 20 字、网关视频模型/prompt/密钥与 Base URL 空配置、导出资讯下载失败统一禁止空成功。验收：`inpaint-continuity-honesty` / `empty-input-honesty` / `agent-honesty` / `magic-hour-honesty` / `export-pack-honesty`。

### 2026-09-11 追加 · 电商规格 / 图生连接 / 拆镜空集 / 预览同步 / Bible 推送

电商包未选规格、图生未配连接与多图空提示 toast、拆镜队列空集正文、预览无可同步分镜、Bible 缺库条目、导演设定未就绪日志、网关视频格式无法识别统一禁止空成功。验收：`export-pack-honesty` / `picture-gen-runner-honesty` / `script-storyboard-empty-honesty` / `storyboard-preview-score-honesty` / `vg-honesty` / `magic-hour-honesty`。

### 2026-09-11 追加 · 资产写回 / 服装库 / 节拍过短 / Provider 未配置

资产健康栏画布未就绪、Bible 缺编剧台、服装设定板非私有库、分镜拖服装缺角色、预览无图检查、镜表空内容告警、视频空成功拒绝日志、beat 音频过短、Magic Hour/Gemini 未配置探测统一禁止空成功。验收：`utility-block-ok-honesty` / `storyboard-preview-score-honesty` / `script-storyboard-empty-honesty` / `video-poll-empty-url-honesty` / `beat-detection` / `magic-hour-honesty`。

### 2026-09-11 追加 · batch-runner 缩放/拆格假成功

`batch-runner` 缩放与宫格拆分补 `ok`/URL 校验，空产物禁止节点 success。验收：`tool-empty-success-honesty`。

### 2026-09-11 追加 · beatAnalyze / Comfy 超时诚实

montage 听音解码失败与未检出节拍、ComfyUI 轮询超时文案统一禁止空成功。验收：`grid-contact-honesty` / `magic-hour-honesty`。

### 2026-09-11 追加 · 上传空 URL 门禁

局部重绘/SmartReplace 蒙版上传、MediaPin 裁切上传、宫格拼接上传、SoundGen 参考音频上传无 URL 禁止空成功。验收：`utility-block-ok-honesty`。

### 2026-09-11 追加 · uploadAsset 统一拒空 URL

前端 `api.uploadAsset` 对 `ok:false` / 空 url / JSON 解析失败统一禁止空成功；服务端无文件上传同口径。验收：`empty-input-honesty` / `grid-contact-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 追加 · BGM/密钥配置 / 关键帧门禁链 / 资产重绑空命中

BGM 未配 Provider/Key/BaseURL、Magic Hour/视频轮询/ASR 缺 Key、clip-gen 关键帧门禁无上游链、分镜禁删光镜表、资产健康重绑零命中与声音绑角色空目标统一禁止空成功。验收：`gateway-music-honesty` / `magic-hour-honesty` / `transcribe-honesty` / `vg-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 追加 · 网关英文必填 / 空图响应 / 工作区空写

Image/TTS/Fal/Comfy/Magic Hour 英文 required、Empty image response、BGM task 不存在、工作区拒空覆盖与空对白、HyperFrames 无 render 统一禁止空成功。验收：`magic-hour-honesty` / `gateway-music-honesty` / `skills-fal-honesty` / `grid-contact-honesty`。

### 2026-09-11 追加 · Fal 空视频 / Gigapixel 无输出 / 导出未通过

Fal 编辑结果无视频/mask、Gigapixel 无输出、Fal Key 未配、Prompt 包格式无效、legacy 导出未通过、SmartReplace 抽帧失败统一禁止空成功。验收：`grid-contact-honesty` / `skills-fal-honesty` / `tool-empty-success-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 追加 · 轮询失败默认文案 / Remotion error / 参考板阻塞

`poll-task` 图/视频失败默认文案、clip-editor Remotion error/超时、参考板约束阻塞、BGM 状态查询失败、SmartReplace 视频替换失败统一禁止空成功。验收：`video-poll-empty-url-honesty` / `clip-editor-render` / `picture-gen-runner-honesty` / `empty-input-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 追加 · playbook/流式 body / 3D 角色绑定 / Fal 下载失败

缺失 video playbook、LLM stream body 缺失、导演 3D 未绑角色、分镜构图硬阈值、Fal storage/结果/追踪/下载失败统一禁止空成功。验收：`empty-input-honesty` / `script-storyboard-empty-honesty` / `grid-contact-honesty`。

### 2026-09-11 追加 · Agent 3D 摆位空前置

摆位未确认/镜头切换/版本过期/未绑角色/应用失败统一禁止空成功。验收：`empty-input-honesty`。

### 2026-09-11 追加 · 轮询超时 / Topaz 未安装 / 工具下载失败

BGM/Fal/Whisper/视频替换与跨帧追踪超时、Topaz/Gigapixel 未检测或执行失败、工具下载/拉取失败、BGM 生成超时统一禁止空成功。验收：`gateway-music-honesty` / `grid-contact-honesty` / `transcribe-honesty` / `skills-fal-honesty` / `manifest-bible-task-honesty`。

### 2026-09-11 追加 · 局部重绘必填 / 故事板空格 / 非 JSON 响应

edit-masked 缺参、故事板无可拼接分镜、编剧缺人物风格、宫格尺寸不足、BGM 非 JSON、Gemini/MH 非 JSON、镜头切换候选帧与跨帧追踪失败统一禁止空成功。验收：`skills-fal-honesty` / `empty-input-honesty` / `grid-contact-honesty` / `gemini-honesty` / `magic-hour-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 追加 · 关键帧链断开 / ControlNet 未知模式 / 拆镜批失败

导演关键帧 source chain 断开、批出硬失败回执、未知 ControlNet 模式、编剧缺集、拆镜队列批失败、Fal 任务/追踪状态、Gemini 请求异常统一禁止空成功。验收：`vg-honesty` / `tool-empty-success-honesty` / `empty-input-honesty` / `script-storyboard-empty-honesty` / `grid-contact-honesty` / `gemini-honesty`。

### 2026-09-11 穷尽审计 · 非通道假成功/诚实门禁

静态扫描（web engine/blocks + server modules）：空关键词 throw / 空 msg / 英文 required 空前置 / `ok:true` 近空产物 / 软 `status:success` 无产物校验 → **产品空成功缺口 0**。唯一软 success 命中为 `story-ops` beat-sync BPM 回退（`listenedToAudio:false`，明示未听音）。残留中文 throw 为 ACL/CRUD（登录/昵称/Skill/公开库等），不属生成空成功。缺陷总表非通道 F 项 100%；仅 F-034/035/049 与 SF-11 真机勾选保持未完成（`REAL-PROVIDER-VALIDATION.md` `- [ ]`，`channel-demo-honesty` 禁虚标）。验收：web `honesty` 22 文件 / 103；server `honesty` 16 / 65；`channel-demo-honesty` 4。

### 2026-09-11 追加 · 上传失败静默吞错

生图参考/风格图、视频首尾帧与参考片、ImageUploadSlot、分镜格上传、画布背景上传失败不再静默 return：`catch` + `toastError`，空 URL 明示禁止空成功。验收：`picture-gen-runner-honesty` / `empty-input-honesty`。

### 2026-09-11 追加 · 素材库/声音/设置上传静默

素材库角色视图/工作区媒体/音频上传、场景服装道具变体、风格参考图、SoundGen 参考音频、设置页画布背景、ImageEditModal 裁切上传、director3d 候选帧/资源上传失败统一 toast/日志或 throw，禁止静默吞错。验收：`empty-input-honesty`。

### 2026-09-11 追加 · ZIP 导入 / 本地投放全失败

`importWorkflowZip` 内嵌资源全部上传失败禁止空成功；部分失败写入 `assetWarnings` 并由 FlowSurface toast；画布本地投放全部失败明示禁止空成功。验收：`empty-input-honesty`。

### 2026-09-11 追加 · 故事板大图失败 toast

分镜台无镜头/无线稿合成与大图生成失败补 `toastError`，不再仅写活动日志。验收：`script-storyboard-empty-honesty`。

### 2026-09-11 追加 · 台面空门禁 / 运行失败 toast

局部重绘空前置、Generation/Prompt/Tool/Video 运行失败、故事板预览空门禁、线稿缺图生连接、拆镜缺成稿包/待补拆文本、交接缺上游编剧台统一 `toastError`，避免仅活动日志。验收：`inpaint-continuity-honesty` / `storyboard-preview-score-honesty` / `script-storyboard-empty-honesty`。

### 2026-09-11 追加 · 导演台 / 剪辑台空门禁 toast

导演台 `failHonest` 统一空门禁与批出/拆分失败 toast；智能剪辑缺交付打包连线、无对白可注入补 toast。验收：`vg-honesty`。

### 2026-09-11 追加 · 分镜/导出/素材库剩余 appendLog-only

批量/宫格线稿空门禁、增量补拆无新镜、审片包无镜表、连贯性缺上游、ExportPack 缺剪辑/时间线/成片 URL、素材库裁切与设定板/五类原图空前置、Prompt 库画布未就绪统一 toast（五类原图误用 toastSuccess 已改为 toastError）。验收：`script-storyboard-empty-honesty` / `export-pack-honesty` / `utility-block-ok-honesty`。

### 2026-09-11 穷尽审计 · scan64 非通道可代码项

扩扫结论（web engine/blocks/panels + server modules）：
- 软 `status:success`：仅 `story-ops` beat-sync BPM 回退（`listenedToAudio:false`）与 `ClipGenBlock` 轮询（已 `success && url`）——**无产品假成功**
- `appendLog`+「禁止空成功」近窗无 toast/error UI：**0**
- 服务端 `ok:true` 近空 URL：均为已校验 URL 或 `processing` 假阳性
- 缺陷总表非通道 F 项 100%；仅 F-034/035/049 与 SF-11 真机未勾（`REAL-PROVIDER-VALIDATION.md` `- [ ]`）
验收：web honesty 22/103；server honesty 16/65；`channel-demo-honesty` 4。

### 2026-09-11 追加 · scan65 上传无 URL + 工作区 toast

扩扫 `uploadAsset` 无 URL 守卫命中 4 处，均已补守卫 + toast：`VideoPlaybookTools` / `EditDesk` 粘贴 / `AssetImportBlock` / 资产库五类原图裁切上传。同步收口仅 `appendLog`/`status:error` 的用户失败：`GridCompose` / `Caption` / `LinkParser` / `VideoWorkspace` Bridge·空 URL 恢复 / `ClipEditor` 编排·渲染 / `FlowSurface` Cascade 非 abort 中断与本地投放部分失败 / `ExportPack` 清单 CSV·PDF·导出 catch·单集合成·HF 失败。验收：`upload-url-honesty` / `export-pack-honesty` + 既有 honesty 子集绿；`channel-demo-honesty` 4；通道真机勾选仍 `- [ ]`。

### 2026-09-11 追加 · scan66 拆镜/线稿/编剧/预览 toast

增量补拆失败、单镜/批量/宫格线稿失败汇总、编剧台抽取·Agent·首生/续写/重写/重试、故事板预览重生成·全景·一致性·宫格、连贯性自动修复、素材库封面裁切·设定板失败统一 `toastError`。拆镜主失败路径仍走 `offerReturnAfterBreakdown` 错误 toast。验收：`script-storyboard-empty-honesty` / `storyboard-preview-score-honesty` / `utility-block-ok-honesty`；`channel-demo-honesty` 4。

### 2026-09-11 追加 · scan67 SmartReplace / 工具块 / ClipGen

`SmartReplacePanel` 抽帧·编辑·生成·替换·恢复空 URL 失败 toast；BgRemove/Upscale/Watermark/Topaz 卡面与 panel 前置与 catch toast；ClipGen 运行/轮询空 URL；SoundGen TTS；连贯性解析失败；编剧导入/剪贴板/Pack；导演台批出部分失败；剪贴板复制失败。验收：`utility-block-ok-honesty` / `video-poll-empty-url-honesty`；`channel-demo-honesty` 4。
