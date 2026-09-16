# NX9 会话验收手册（一键验收 + 运行手册）

> 对象：`scripts/nx9-session-acceptance.mjs`（本文简称「验收脚本」）
> 配套：`scripts/nx9-missing-modules-doctor.mjs`（体检工具）、`docs/NX9-MISSING-MODULES-RESTORE.md`（恢复指引）
> 单测：`apps/web/src/engine/__tests__/nx9-session-acceptance.test.ts`（纯函数判定逻辑）
> 探针：`apps/web/src/engine/__tests__/nx9-acceptance-selfcheck-probe.test.ts`（第 6 阶段取数）

---

## 1. 一条命令

在**仓库根**执行：

```bash
node scripts/nx9-session-acceptance.mjs
```

输出是逐阶段的「期望 / 实测 / 结论 / 退出码 / 日志路径」，末尾是总裁决与下一步。
退出码：**PASS → 0；FAIL → 1；BLOCKED → 2**（用法错误同样 2，并会在 stderr 打印用法）。

机器可读：

```bash
node scripts/nx9-session-acceptance.mjs --json            # 结构化报告（键顺序固定）
node scripts/nx9-session-acceptance.mjs --json --stable   # 去掉时间戳/耗时，可逐字节 diff
node scripts/nx9-session-acceptance.mjs --stage=3         # 只跑到第 3 阶段
node scripts/nx9-session-acceptance.mjs --help            # 全部选项
```

> **不许把「跑得通」当成「达标」**：脚本的原则是「拿不到数据 → 报 fail 并写明拿不到什么」，
> 唯一的例外是**已证明的阻塞条件**（barrel 缺模块）→ 报 `blocked`，且依赖它的阶段报 `skip-blocked`。

---

## 2. 六个阶段：查什么、期望是什么

| # | 阶段 | 命令 / 取数方式 | 期望（恢复前） | 期望（恢复后） |
| --- | --- | --- | --- | --- |
| 1 | **前置体检** | 进程内复用 `missing-modules-doctor.mjs` 的 `runDoctor()` | 缺失模块 **8** → `blocked`（点名缺哪几个） | 缺失模块 **0** → `pass` |
| 2 | **shared 构建** | `pnpm --filter @nx9/shared build` | `skip-blocked`（不执行） | exit 0 → `pass` |
| 3 | **类型检查** | `pnpm --filter @nx9/shared typecheck` + `pnpm --filter @nx9/web typecheck` | `skip-blocked`（不执行） | 两条都 exit 0 → `pass` |
| 4 | **新增能力测试** | `pnpm --filter @nx9/web exec vitest run <清单文件>` | **41 文件 / 1028 用例全绿 → `pass`** | 同左 → `pass` |
| 5 | **全量测试** | `pnpm --filter @nx9/web exec vitest run` | `skip-blocked`（不执行） | 失败文件数 = 0 → `pass` |
| 6 | **能力自检** | 探针测试 → `NX9_SELFCHECK_OUT` 报告 | `error 0 / warn 3 / ok 5` → `pass` | 同左 → `pass` |

### 2.1 逐阶段说明

1. **前置体检**：不看源码文本，不看 grep 结论 —— 由体检工具静态解析 `packages/shared/src/index.ts`
   的每个 `export … from './…'`，解析不到的模块即「缺失模块」，并列出 barrel 要求的**必需导出**与
   **全仓消费方**。数量来自体检报告，**没有写死在脚本里**；报告里同时给出「等价 `--strict` 退出码」。
   旁支提醒：「已在磁盘但未被 git 登记」的 barrel 依赖（今天 **22** 个，其中含 `shot-library-seeds.ts`）
   **只提示不阻塞** —— 它不影响本机，但新克隆会缺。
2. **shared 构建**：恢复前必然失败（`tsc` 报 8 × TS2307），所以脚本**不执行**它，直接标 `skip-blocked`，
   避免白等。判定逻辑（`evaluateExitZeroRuns`）仍写好了：任一命令非 0 → `fail`，并带出 `error TSxxxx` 计数。
3. **类型检查**：shared / web 两条 `tsc -b` 都要 exit 0；任一非 0 → `fail`（附诊断码统计与首个诊断行）。
4. **新增能力测试**：清单**从 git 现取**（`git ls-files --others --exclude-standard` ∪ `git diff --diff-filter=A`，
   再按 `apps/web/vitest.config.ts` 的 include 规则过滤），不是写死的过期清单。判定三项：
   exit 0、失败文件数 0、失败用例数 0，外加**收集到的文件数 = 清单长度**（防止有文件被静默漏掉）。
   git 取不到时退回脚本内置快照，并在报告里标 `inventorySource: "manifest-fallback"` + 备注；
   清单里有、磁盘上没有的条目会被点名并判 `fail`。
5. **全量测试**：期望 `失败文件数 = 0 且失败用例数 = 0`。恢复前的实测基线（两行都要看，别混用）：

   | 时点 | 测试文件 | 用例 | 失败文件 | 错误签名 |
   | --- | --- | --- | --- | --- |
   | 交付前（会话内 39 个新测试已在树上） | `84 failed \| 81 passed (165)` | `2 failed \| 1109 passed \| 1 skipped (1112)` | 84 | 全部为 barrel 解析失败 |
   | 交付后（本文这套验收工具 +2 个测试文件） | `84 failed | 83 passed (167)` | `2 failed | 1187 passed | 1 skipped (1190)` | **仍是 84** | **与交付前逐条一致（`added=0 / changed=0`）** |

   84 个失败文件里 82 个是「收集期 0 用例」、2 个是「收集到用例但用例内 import 失败」
   （`DirectorDeskBlock` / `ScriptDeskBlock` 渲染用例），**错误签名 100% 是
   `Failed to resolve import "./data/emotion-presets"`**（83 个）与同因的
   `Cannot find module './data/emotion-presets' imported from …`（1 个）——即第 1 阶段的同一根因。
   脚本会把每个失败文件的**错误签名**抽出来放进 `metrics.failedFileSignatures`，供 `--baseline` 对照。
6. **能力自检**：取数壳层（`apps/web/src/engine/capability-selfcheck.ts`）顶部有 `import.meta.glob`，
   node 里直接 import 会抛错 → 由探针测试在 Vite/vitest 环境下调用**同一份**壳层与纯函数，
   并在设置了 `NX9_SELFCHECK_OUT` 时把报告写成 JSON 供脚本读取。
   期望 `counts.error = 0` 且 `complete = true`；**warn 不是失败**（今天 3 项 warn：
   `catalog-loader-parity` / `socket-definition` / `attached-workspace-entry`，均为「已废弃 asset-gate 的历史遗留」）。

### 2.2 「恢复前 / 恢复后」两套期望，一张表

| 裁决 | 触发条件 | 退出码 | 下一步 |
| --- | --- | --- | --- |
| `PASS` | 6 个阶段全部 `pass` | 0 | 无需操作 |
| `BLOCKED` | 存在 `blocked` 或 `skip-blocked`（无 `fail`） | 2 | 按 §4 恢复 3 步 |
| `FAIL` | 存在任一 `fail` | 1 | 修对应阶段（报告里有日志路径），再重跑 |

**恢复前**（barrel 缺 8 模块）：`BLOCKED`，`通过 2（阶段 4、6）、阻塞 1（阶段 1）、跳过（前置阻塞）3（阶段 2、3、5）`。
**恢复后**：应变成 `PASS`（6/6 通过）；`--baseline` 对照应显示「失败集清空、零新增失败」。

---

## 3. 怎么读输出

### 3.1 文本报告

每个阶段一段，固定四行起：`期望` / `实测` / `命令` / `进程 exit code` / `日志`，再跟若干 `注`。
末尾三段：`阻塞项`（点到**具体缺哪几个模块 + 应该放回哪个路径**）、`失败集对照`（仅 `--baseline` 时出现）、`下一步`。
`未取到进程结果` / `既没有 JSON 报告也没有文本摘要` 这类措辞 = **拿不到证据**，此时结论一律 `fail`，不会假 pass。

### 3.2 `--json` 输出

顶层键（顺序固定）：

| 键 | 含义 |
| --- | --- |
| `schemaVersion` / `tool` / `repoRoot` | 结构版本（当前 `1`）、工具相对路径、仓库根 |
| `verdict` / `exitCode` | `PASS`/`FAIL`/`BLOCKED` 与对应退出码（0/1/2） |
| `complete` / `truncatedAt` | 是否跑满 6 阶段；`--stage=n` 时为 `n`，否则 `null` |
| `stageCount` / `expectedStageCount` | 本次报告里的阶段数 / 应有个数（6） |
| `counts` | `{pass, fail, blocked, "skip-blocked", skipped, total}` |
| `summaryZh` / `blockers` / `nextSteps` | 一句话摘要 / 阻塞项（含 `missingModules`、`missingModulePaths`）/ 下一步 |
| `stages[]` | 每阶段：`index/id/title/status/expectationZh/actualZh/exitCode/command/logPath/metrics/notes`（+`durationMs`） |
| `outDir` | 日志与中间产物目录（默认 `%TEMP%/nx9-acceptance`，见 §3.4） |
| `stable` | 仅 `--stable` 时出现，表示耗时字段已被剔除 |
| `regression` | 仅 `--baseline` 时出现：`identical` / `zeroNewFailures` / `added` / `changed` / `removed` |
| `regressionNoteZh` | 仅在「给了 `--baseline` 但第 5 阶段没产生失败集」时出现：说明**跳过**对照、不做零回归结论（避免把「拿不到当前失败集」误读成「84 个失败全转绿」） |

常用提取（不用 grep，直接 node）：

```bash
# 只看裁决与阻塞模块
node scripts/nx9-session-acceptance.mjs --json --stable | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);
console.log(r.verdict, r.exitCode, r.summaryZh);
console.log(r.blockers.flatMap(b=>b.missingModules).join(', '));});"
```

`--stable` 的意义：同一工作树、同一份代码，两次运行输出**逐字节相同**（时间戳与耗时为唯一变量，已被剔除），
所以可以直接 `diff before.json after.json` 看「恢复前后到底改动了什么事实」。

### 3.3 用 `--stage` 定位

```bash
node scripts/nx9-session-acceptance.mjs --stage=1     # 只体检（秒级），看今天到底缺什么
node scripts/nx9-session-acceptance.mjs --stage=4     # 只跑新增能力测试
node scripts/nx9-session-acceptance.mjs --stage=6     # 只跑能力自检
```

截断运行时：被跳过的阶段标 `skipped`、`complete=false`、报告里写明「结论仅对已跑阶段成立」。
注意 **`skipped`（截断没跑）≠ `skip-blocked`（前置阻塞没跑）** —— 前者是你的选择，后者是仓库的缺陷。

### 3.4 日志与中间产物

默认写到 `%TEMP%/nx9-acceptance/`（`--out-dir=<目录>` 可改；脚本**只写不删**）：

```
doctor.log                              # 第 1 阶段的进程内体检摘要（缺哪些模块）
shared-build.log / typecheck.log        # 第 2、3 阶段的完整 stdout+stderr
new-capability-tests.log                # 第 4 阶段人类可读 vitest 摘要
new-capability-tests.vitest.json        # 第 4 阶段机器可读 vitest 报告
full-tests.log / full-tests.vitest.json # 第 5 阶段
capability-selfcheck.log                # 第 6 阶段（探针 stdout）
capability-selfcheck.json               # 第 6 阶段的能力自检报告本体
```

### 3.5 与上次对照：`--baseline`

```bash
# ① 恢复前留档（含全量测试失败集）
node scripts/nx9-session-acceptance.mjs --json --stable --run-blocked > before.json
# ② 恢复后对照
node scripts/nx9-session-acceptance.mjs --json --stable --baseline=before.json > after.json
```

`--run-blocked` = 前置阻塞时**也**把依赖 barrel 的阶段真跑一遍。它只影响「跑不跑」，不影响归类：
被强制执行的阶段即使失败，只要根因是已知阻塞，结论仍是 `blocked`（实测数据原样保留，不被掩盖）。
要留「恢复前基线」，`--run-blocked` 是**必须**的 —— 否则第 5 阶段不会执行，也就没有失败集可对照。

`regression.zeroNewFailures === true` 即「零回归」（没有新增失败、没有签名变化）；
`removed` 里的条目是「转绿的失败」。

若本次第 5 阶段没跑（`--stage` 截断 / 前置阻塞且没加 `--run-blocked`），脚本**不会**拿空集去比，
而是给出 `regressionNoteZh` 并跳过对照（否则会假装「失败全部转绿」）。

---

## 4. 今天的状态与阻塞

**结论：`BLOCKED`（exit code 2）** —— 这是**预期结果**，不是脚本坏了。

```
通过 2（阶段 4、6）・阻塞 1（阶段 1）・跳过（前置阻塞）3（阶段 2、3、5）
阻塞点：8 个缺失模块
```

| 阶段 | 今天实测 |
| --- | --- |
| 1 前置体检 | **阻塞**：缺失模块 8 / 8；barrel 相对引用 162 个；必需导出 61 个（value 47 / type 14）；消费方 95 处 / 42 文件 |
| 2 shared 构建 | 跳过（前置阻塞）——恢复前第一步 `tsc` 就报 8 × TS2307 |
| 3 类型检查 | 跳过（前置阻塞） |
| 4 新增能力测试 | **通过**：41 文件 / 1028 用例 / 失败 0 / exit 0（清单来源 `git`） |
| 5 全量测试 | 跳过（前置阻塞）——恢复前实测 84 个失败文件（全部同一根因） |
| 6 能力自检 | **通过**：`error 0 / warn 3 / ok 5`（检查项 8）；kinds 107（目录 22）/ 模板 33；`complete=true` |

用 `--run-blocked` 强制真跑第 2/3/5 阶段时（退出码仍是 2，失败按已知阻塞归类为 `blocked`，实测数据保留）：

| 阶段 | 强制真跑后的实测 |
| --- | --- |
| 2 shared 构建 | exit 2，`tsc` 诊断 41 条（`TS2307×17 / TS7006×15 / TS7053×9`） |
| 3 类型检查 | shared exit 2（41 条）；web exit 1（80 条，含 `TS2307×2`） |
| 5 全量测试 | exit 1：`84 failed | 83 passed (167)` 文件、`2 failed | 1187 passed | 1 skipped (1190)` 用例 |

> 那 41 / 80 条 `TS7006`（隐式 any）等诊断是**旧账**：既有代码里本就存在的类型宽松点，
> 只是 `tsc` 在「先撞上 TS2307 停下」前不会全部报出来。恢复 barrel 后再看这份数字，不要当成新回归。

缺失的 8 个模块（**内容不在本仓库里，必须取回，不能现写**）：

```
packages/shared/src/data/emotion-presets.ts
packages/shared/src/data/shot-move-families.ts
packages/shared/src/data/creative-asset-presets.ts
packages/shared/src/data/character-face-rig-presets.ts
packages/shared/src/data/playbook-definitions.ts
packages/shared/src/data/camera-presets.ts
packages/shared/src/data/shot-lexicon-taxonomy.ts
packages/shared/src/data/provider-registry.ts
```

### 恢复 3 步（完整清单见 `docs/NX9-MISSING-MODULES-RESTORE.md` §2/§3，本文不重复）

```bash
# 第 1 步：从备份 / 另一台机器 / 交付包取回这 8 个文件的原始内容（不要照着接口猜着写）
# 第 2 步：放回 packages/shared/src/data/（文件名必须与 barrel specifier 一致；不要改 barrel 的既有 import）
# 第 3 步：验证
node scripts/nx9-missing-modules-doctor.mjs --strict    # 期望：无缺失 + exit 0
node scripts/nx9-session-acceptance.mjs                 # 期望：PASS + exit 0
```

> 恢复后 `apps/web/src/engine/__tests__/missing-modules-doctor.test.ts` 里那组**故意钉住「恰好 8 个缺失模块」**
> 的用例会转红 —— 那是预期现象（它证明「恢复确实改变了事实」），按恢复文档的说明把断言改成
> `missingModuleCount === 0` 并保留，别删。

---

## 5. 已知边界：脚本能验 / 不能验

**能验（有真实证据）**

- barrel 的静态可解析性与缺失模块清单（含必需导出、消费方位置）。
- `shared` 构建 / 两条 `typecheck` 的真实退出码与 `tsc` 诊断码。
- 新增能力测试与全量测试：**收集到多少文件、多少用例、失败几个、失败签名是什么**（vitest JSON 报告）。
- 能力自检的 `error/warn/ok` 计数与检查项 id（真实读 5 个源文件解析出的接线事实）。
- 「恢复前后」的失败集是否一致（零回归判定）。

**不能验（不要据此下结论）**

- ❌ **真实出图 / 出片**：不调用任何模型或供应商 API，不做端到端生成。
- ❌ **浏览器交互**：不启动 dev server，不点按钮、不拖节点；`capability-selfcheck` 的浏览器取数路径
  只在 vitest 的 jsdom 里被探针调用（`import.meta.glob`），不等于真实浏览器渲染。
- ❌ **Electron 打包 / 桌面端**：完全没覆盖。
- ❌ **服务端与数据库**：`apps/server` 的测试与 prisma 迁移不在本脚本范围内。
- ❌ **恢复后的结果**：恢复后能变绿是**推断**（84 个失败文件的错误签名全是 barrel 解析失败），
  恢复前没有实测证据；恢复后请用 §3.5 的 `--baseline` 对照来证明，而不是相信推断。
- ❌ **静态清单的时效**：第 4 阶段的 include 快照来自 `apps/web/vitest.config.ts`；若 include 规则改了，
  需要人工同步 `VITEST_INCLUDE_PATTERNS`（脚本不解析该配置文件，以免引入配置解析依赖）。
  清单文件数量与用例数**不硬编码**：脚本断言的是「收集数 = 清单长度」与「失败数 = 0」。

---

## 6. 自检这套验收工具本身

```bash
pnpm --filter @nx9/web exec vitest run src/engine/__tests__/nx9-session-acceptance.test.ts \
                                     src/engine/__tests__/nx9-acceptance-selfcheck-probe.test.ts
```

- `nx9-session-acceptance.test.ts`：73 个用例，覆盖 CLI 解析、glob/include 匹配、清单解析（含兜底与「磁盘缺失」）、
  vitest/tsc 输出解析、失败集对照、六个阶段的 pass/fail/blocked/skip-blocked 组合、阻塞传播、
  裁决与退出码、`--run-blocked` 归类、空清单不启动 vitest、`--json` 结构与 `--stable` 稳定性、
  脏输入不抛异常、真实仓库冒烟。
- `nx9-acceptance-selfcheck-probe.test.ts`：5 个用例，钉住「真实工作树自检 error = 0 且 complete」、
  「glob 取数路径与 node:fs 直读路径结论一致」、「同一输入同一输出」。

**反向对照**（证明这套断言真的会红）：把 `evaluateDoctorStage` 的 `missingModuleCount > 0 → blocked`
改成 `→ pass`，或在测试里把「期望 blocked」写成「期望 pass」，单测必须失败；改完用**拷贝**恢复文件
（不要用 `git show HEAD:file > file` 之类覆盖）。

---

## 7. 验证记录（本工具交付时实跑）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `node scripts/nx9-session-acceptance.mjs` | **2** | `BLOCKED`：通过 2（阶段 4、6）・阻塞 1（阶段 1）・跳过（前置阻塞）3（阶段 2、3、5） |
| `node scripts/nx9-session-acceptance.mjs --json --stable --stage=1` | **2** | `BLOCKED`，`complete=false`、`truncatedAt=1`，点名 8 个缺失模块 |
| `node scripts/nx9-session-acceptance.mjs --run-blocked --json` | **2** | `BLOCKED`（4 个 blocked + 2 个 pass），第 2/3/5 阶段的实测数据被保留 |
| `pnpm --filter @nx9/web exec vitest run src/engine/__tests__/nx9-session-acceptance.test.ts src/engine/__tests__/nx9-acceptance-selfcheck-probe.test.ts` | **0** | `2 passed (2) / 78 passed (78)` |
| `node scripts/nx9-session-acceptance.mjs --stage=4 --test=<barrel 依赖的失败测试>` | **1** | `FAIL`：失败文件 1 / exit 1 —— 脚本不会给失败盖章 |
| `node scripts/nx9-session-acceptance.mjs --stage=4 --test=<不存在的路径>` | **1** | `FAIL`：0.4 秒内报「清单为空 → 不启动 vitest」，并点名缺失文件 |
| `node scripts/nx9-session-acceptance.mjs --json --stable`（连跑两次） | **2 / 2** | 两次输出 **sha256 完全相同**（`1365…bee0`）→ `--stable` 报告可逐字节 diff |

**反向对照（三次，全部用拷贝恢复，恢复后 sha256 与原文件一致）**

1. 把脚本里 `missingModuleCount > 0 → BLOCKED` 改成 `→ PASS` → 单测 **2 个用例转红**
   （`expected 'pass' to be 'blocked'`），恢复后 72/72 转绿（对照时点；此后单测又补了 1 个用例，现为 73 个）。
2. 把单测里 `expect(result.status).toBe(SKIP_BLOCKED)` 故意改成 `PASS` → 该用例 **转红**
   （`expected 'skip-blocked' to be 'pass'`），恢复后 72/72 转绿（同上，现为 73 个）。
3. 反向对照期间**没有**改动任何产品代码；被改的两个文件都用 `cp` 从临时目录副本恢复，并核对 sha256 一致。

**全量回归前后基线对照（零回归）**

```bash
# 交付前：pnpm --filter @nx9/web exec vitest run --reporter=json --outputFile=<before>.json
# 交付后：node scripts/nx9-session-acceptance.mjs --run-blocked --json   （第 5 阶段落 full-tests.vitest.json）
```

| 指标 | 交付前 | 交付后 | 判定 |
| --- | --- | --- | --- |
| 测试文件 | 165（84 failed / 81 passed） | 167（**84 failed** / 83 passed） | 失败数不变、新增 2 个全绿文件 |
| 用例 | 1112（2 failed / 1109 passed / 1 skipped） | 1190（**2 failed** / 1187 passed / 1 skipped） | 失败用例不变、+78 全绿 |
| 失败文件错误签名 | 84 条（83 × `Failed to resolve import "./data/emotion-presets"`，1 × `Cannot find module './data/emotion-presets'`） | 84 条，**逐条一致** | `identical = true`，`added = 0 / changed = 0 / removed = 0` |

→ **零回归**：没有新增失败，没有签名变化，失败文件集合完全一致。

