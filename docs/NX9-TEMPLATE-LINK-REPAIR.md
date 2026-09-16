# NX9 工作流模板非法连线修复

修复对象：`packages/shared/src/data/workflow-templates.ts` 的 `WORKFLOW_TEMPLATES`（33 条模板）。
防回归测试：`apps/web/src/engine/__tests__/workflow-templates-links.test.ts`。

## 1. 结论速览

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 模板数 | 33（既有 28 + 增量 5） | 33（未增删、未改顺序） |
| 连线总数 | 97 | 90（删除 7 条无法表达原意的同 kind 链） |
| 非法连线（`validateLink` 失败） | **12**（命中 9 条模板） | **0** |
| 白名单条目 | — | 空（测试内置登记机制，当前无条目） |

> 上一轮文档 `docs/NX9-NEW-CAPABILITY-ENTRYPOINTS.md` 第 7 节写「16 条既有非法口型对 / 命中 12 条模板」。
> 本次实测为 **12 条边 / 9 条模板**，该处数字口径未能复现（旧数字未附复现脚本）。

## 2. 审计方法

1. 判定函数：`packages/shared/src/catalog/socket-registry.ts` 的
   `validateLink(sourceKind, targetKind, sourceData, targetData)`。
   - 同 kind 拒绝（`passthrough` 例外）；
   - `resolveEmits(kind,data)` / `resolveAccepts(kind,data)` 取口型（`asset-import` / `media-pin` / `asset-bundle` 走 data 分支）；
   - `socketsCompatible`：任一侧为空即不兼容，含 `wildcard` 则兼容。
2. 脚本口径：对每条模板 `build()` 一次，把 `blocks` 建 `id → {type,data}` 映射，
   对每条 `link` 用 `source/target` 还原 kind + data 后调用 `validateLink`（`build()` 内 id 每次新建，必须同一次 build 内解析）。
3. 溯源口径：`git show 33e70db -- packages/shared/src/data/workflow-templates.ts`
   （F-013「废弃 kind → 活跃 kind」那次改写）比对每条非法边迁移前的 kind。

审计命令与结果（两条独立 runner，均为 exit 0）：

```bash
# ① vitest（vite 解析）
cd apps/web && npx vitest run src/engine/__tests__/workflow-templates-links.test.ts   # exit 0，9 tests passed

# ② 纯 Node（node:module resolve hook 补 .ts 后缀，绕开 vite/vitest）
node .tmp-register.mjs   # 模板数=33 连线总数=90 非法=0，exit 0（临时脚本已删除）
```

## 3. 根因：12 条非法边全部是 F-013 迁移产物

F-013 把模板里的废弃 kind 机械替换为活跃 kind，副作用是**把原本不同的 kind 合并成同一个 kind**
（同 kind 不可连），或**合并成不接任何口型的 kind**（`asset-import` accept 为 `[]`）。
迁移前的原始 kind（`git show 33e70db`）：

| 迁移前 kind | 迁移后 kind | 迁移后 property |
|---|---|---|
| `preview-sink` | `asset-import` | `accepts: []` → 任何 `X → asset-import` 非法；且左侧不渲染入口 handle |
| `prompt` / `prompt-studio` | `picture-gen` | 与下游 `picture-gen` 同 kind → 非法 |
| `light-rig` / `depth-pass` | `director-desk` | 三台同 kind → 非法 |
| `bridge-clip` | `clip-gen`（`videoMode=bridge`） | 三段同 kind → 非法 |
| `thumbnail-maker` | `export-pack` | 同 kind 且 `export-pack emits: []` → 非法 |

**不能改回旧 kind**：上述 kind 全部登记在 `packages/shared/src/catalog/migrate-block-kinds.ts` 的
`BLOCK_KIND_MIGRATIONS`（`DEPRECATED_BLOCK_KINDS`），模板里写它们会在加载时被静默改写，
违反模板文件自身注释「模板节点必须直接写活跃 kind；禁止经 migrate 垫片静默改写（F-013）」。

**不动 `socket-registry.ts`**：那是全局口型契约，放宽它会波及全仓（本次只修模板）。

## 4. 逐条修复记录

### A 组：末端「结果预览位」5 条 —— 改目标节点为活跃 kind（保留连线与预览语义）

共同依据：末位节点原本是 `preview-sink`（`accepts: ['prompt','picture','clip','sound','mesh','wildcard']`），
F-013 合并到 `asset-import` 后口型归零。活跃 kind 中承接「生成结果预览」的节点是
`media-pin`（画布钉板，`INTERNAL_BLOCKS`，`accepts/emits: picture/clip/sound/mesh/prompt`；
`stage-deck-node-types.tsx` 明确按「自有摘要卡」渲染），故按节点类型替换为 `media-pin`，
并给边补显式 handle（左右口 id 即 socket kind）。

| # | 模板 id | 原 link | 问题 | 改为 | 依据 |
|---|---|---|---|---|---|
| 1 | `tpl-nx9-character-pipeline` | `picture-gen → asset-import` | `asset-import` accepts=[] → 非法；左侧无入口 handle | 节点 `asset-import` → `media-pin {pinKind:'picture'}`；边 `sourceHandle/targetHandle = picture/picture` | 迁移前为 `preview-sink`；描述「…→ 图像生成 → 素材预览」保预览语义 |
| 2 | `tpl-text-to-picture` | `picture-gen → asset-import` | 同上 | 同上（`pinKind:'picture'`） | 迁移前为 `preview-sink`；描述「→ 结果预览」 |
| 3 | `tpl-image-to-clip` | `clip-gen → asset-import` | 同上（clip 侧重） | `media-pin {pinKind:'clip'}`；边 `clip/clip` | 迁移前为 `preview-sink` |
| 4 | `tpl-storyboard-grid` | `grid-compose → asset-import` | 同上 | `media-pin {pinKind:'picture'}`；边 `picture/picture` | 迁移前为 `preview-sink`；描述「→ 预览」 |
| 5 | `tpl-av-post` | `clip-editor → asset-import` | 同上 | `media-pin {pinKind:'clip'}`；边 `clip/clip` | 迁移前为 `preview-sink`；描述「→ 素材预览」 |

**行为变化（须知情）**：
`asset-import` 在 `RUNNABLE_BLOCKS` 内，运行时会执行 `flow-runner-ops/media-ops.ts` 的
`asset-import` 分支——该节点自身素材列表为空时 `throw new Error('资产导入列表为空，禁止空成功')`，
即这 5 条模板此前**跑到末位必失败**。`media-pin` 不在 `RUNNABLE_BLOCKS` 内，运行时被
`runFlowBatch` 的 `runnable()` 过滤跳过，不报错、也不会自动填入上游结果——它是「留给用户从生成结果
拖入的钉板」。这是本次修复带来的**行为改变**，不是纯等价替换。

### B 组：同 kind 链 7 条 —— 删除连线并留证

无法在不改变模板原意的前提下修复（目标 kind 语义正确，但活跃 kind 已合并，图内无法相连），
按「宁可删线也不硬凑语义错误的连线」处理；**节点全部保留**。

| # | 模板 id | 原 link（删除） | 问题 | 依据（迁移前 kind） | 删除后残留节点 |
|---|---|---|---|---|---|
| 6 | `tpl-text-to-picture` | `a(picture-gen) → b(picture-gen)` | 同 kind 拒绝 | `a` 原为 `prompt`（提示词节点），F-013 并入 `picture-gen` | `a` 孤立（`content` 仍保存提示词） |
| 7 | `tpl-character-turnaround` | `b(picture-gen) → c(picture-gen)` | 同 kind 拒绝 | `b` 原为 `prompt-studio {studioTab:'angle'}` | `b` 孤立（保留 angle 工作室配置） |
| 8-9 | `tpl-spatial-pipeline` | `a→b`、`b→c`（均 `director-desk → director-desk`） | 同 kind 拒绝 | `b`=`light-rig`、`c`=`depth-pass`，均已并入 `director-desk` | `a`、`b` 孤立；保留 `c → d(picture-gen)` |
| 10-11 | `tpl-bridge-sequence` | `a→b`、`b→c`（均 `clip-gen → clip-gen`） | 同 kind 拒绝 | `b`=`bridge-clip`，已并入 `clip-gen (videoMode=bridge)` | `a`、`b` 孤立；保留 `c → d(director-desk)` |
| 12 | `tpl-cover-export` | `export-pack → export-pack` | 同 kind + `export-pack emits: []` | `a`=`thumbnail-maker`（封面制作），已并入 `export-pack` | 模板变为 **0 连线**（`status: 'deprecated'`，启动器不展示） |

每处删除均在模板源码就地写明原因（迁移前 kind + 为何不能连），不留 TODO。

## 5. 全量校验测试（防回归）

`apps/web/src/engine/__tests__/workflow-templates-links.test.ts`（9 个用例）：

| 用例 | 断言 |
|---|---|
| 每一条 link 都通过 `validateLink` | 遍历全部 33 条模板的每条 link（含 data 派生口型），非法即失败并打印 `模板id: 源kind → 目标kind` |
| 显式 handle 落在真实口内 | 左右口取 `resolveEmits/resolveAccepts`，上下能力口取 `resolveVisibleVerticalSockets`（受 `showExecPorts` 控制，`exec-picture` 不是悬空 handle） |
| 12 条历史非法口型对已消失 | 按 kind 对回归，重现即失败 |
| 白名单不是整体跳过 | 未登记的非法连线直接失败；白名单条目必须附原因、必须仍命中、且不得已恢复合法（防白名单腐烂） |
| 端点 ∈ 本模板节点 id | 且无自环、无重复边、连线 id 唯一、节点 id 唯一 |
| 无以 `asset-import` 为下游的边 | 回归本次 A 组缺陷（`asset-import` 无入口 handle） |
| 模板数量 / id 集合 = 修复前基线 | 既有 28 + 增量 5 条，顺序逐条一致（本次修复不增删模板） |
| 模板 id 全局唯一 | — |
| 元数据齐备 | `label/description` 非空、`category/status` 合法 |

白名单机制：`ILLEGAL_LINK_WHITELIST: { key, reason }[]`，当前为**空数组**（0 非法连线）。
若将来出现确实无法修复而必须保留的非法边，须显式登记 `模板id|源kind → 目标kind` 并写原因。

测试用相对路径直取源码（`../../../../../packages/shared/src/...`），不走 `packages/shared/src/index.ts`
barrel（该 barrel 引用 8 个不存在的 `data/*` 模块，属既有缺陷）。

## 6. 验证口径与证据

| 验证 | 命令 | 结果 |
|---|---|---|
| 全量连线校验（vitest） | `cd apps/web && npx vitest run src/engine/__tests__/workflow-templates-links.test.ts` | **exit 0**，9 tests passed |
| 全量连线校验（独立 runner，纯 Node） | `node .tmp-register.mjs`（node:module resolve hook 补 `.ts`） | **exit 0**，`模板数=33 连线总数=90 非法=0` |
| 模板相关回归（6 个文件） | `npx vitest run workflow-templates-links / workflow-templates-new / recipe-picker-overlay.test.tsx / first-lane / character-sheet-block-map / multi-grid-block-map` | **exit 0**，6 files / 56 tests passed |
| 变异验证（测试有效性） | 注入 M1 `tpl-nx9-character-pipeline` 预览节点改回 `asset-import`；M2 `tpl-batch-pictures` 末端 `export-pack → picture-gen` | **exit 1**，4 个用例失败，报出 `tpl-nx9-character-pipeline: picture-gen → asset-import`（口型 / 悬空 handle / dead-edge 三处）与 `tpl-batch-pictures: picture-gen → picture-gen`；恢复后 `sha256sum -c` 校验一致 |
| 隔离类型检查 | `cd apps/web && npx tsc -p tsconfig.template-links-check.json --noEmit` | exit 2，**仅 1 条错误**：`packages/shared/src/types/workspace.ts(9,33) TS2307: Cannot find module '../data/playbook-definitions'`——既有缺陷（该文件未被本次改动，`playbook-definitions` 属任务禁止创建的路径）；本次改动文件本身 0 错误 |

### 未验证 / 不可验证项（不谎报）

1. **`packages/shared` 仍无法构建**：barrel 引用 8 个不存在模块（既有缺陷），未触碰。
2. **`apps/server` 验收测试无法运行**：其 `@nx9/shared` 解析到过期 `dist/esm/index.js`，
   加载即报 `Cannot find module './data/emotion-presets'`（既有缺陷，与本改动无关）。
   已静态核对受影响断言：`f035-f049-acceptance.test.ts` 对 `tpl-bridge-sequence` 只断言
   `status==='beta'` 与「存在 `videoMode='bridge'` 的 clip-gen 节点」，本次仅删边、节点全保留 → 仍成立；
   `f006-f008` / `f005` / `test-pipe` / `ai-short-film-workflow` / `f014` / `ux-first-lane` 只针对
   `tpl-core-episode` / `tpl-ai-short-film` / `tpl-voice-drama` 等**本次未改动**的模板。
3. **浏览器端未实测**：未启动 dev server 验证 `media-pin` 预置节点在画布上的实际渲染与拖入行为。
   代码路径已核对（`registry.tsx` 注册、`stage-deck-node-types.tsx` 原生卡分支、`BlockShell` → `SideSocketRails`
   按 `resolveAccepts/resolveEmits` 渲染 id 为 `picture`/`clip` 的口），但**未做 GUI 验证**。
4. **端到端运行未验证**：未跑真实 provider 的成片流程。

## 7. 残留风险

1. `tpl-cover-export` 现为 0 连线（两个 `export-pack` 节点各自独立）。
   若要恢复「封面制作 → 交付打包」，需在口型契约层面给封面能力一个独立活跃 kind，或让
   `thumbnail-maker` 的迁移目标不再与下游同 kind —— 均超出「只修模板」范围。
2. B 组 5 条模板的链式拓扑已断（节点保留、边删除）。若后续希望恢复链路，
   需要设计层给出可区分的活跃 kind（如独立的「续拍」「灯光」「深度」节点），而不是回到废弃 kind。
3. `media-pin` 属 `INTERNAL_BLOCKS`（不进 Dock / 命令面板）。模板预置的钉板节点是系统创建路径，
   与「仅程序化 spawn」的既有约定不冲突，但用户在 Dock 里搜不到该节点，属设计上可讨论点。
