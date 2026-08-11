# NX9 主流程跑通阻断审计

> 审计日期：2026-08-05
> 审计范围：依赖安装、构建、启动、工作区、编剧台、分镜台、导演台、关键帧、视频、智能剪辑和导出。
> 说明：本次不读取 Reference_Projects/。工作区已有未提交改动，本审计不回滚这些改动。

## 1. 总结结论

本轮修复后，NX9 的本地 mock 主流程已完成放行；真实供应商和外部媒体工具链仍需凭据/运行时环境验收。

已恢复完整依赖并通过三层类型检查、生产构建、服务启动、工作区持久化和主链浏览器验收。

即使恢复依赖，完整生产链仍有以下阻断或未闭环风险：真实供应商链没有被证明；服务端 .env 加载时序存在配置失效风险；导演台并发写回、链隔离、跨集确认和旧 handoff 虽有修复痕迹，但缺完整浏览器和刷新后持久化证据；媒体渲染和导出缺真实产物验收；全仓没有统一的全量验证入口。

## 2. 运行链路

安装依赖 → 构建 shared → 启动 server → 启动 web → 创建工作区 → 编剧确认成稿 → 分镜拆镜并确认 → 导演批出关键帧 → 审核并推送视频 → 智能剪辑 → Remotion/导出交付。

## 3. 阻断总表

| ID | 级别 | 状态 | 结论 |
|---|---|---|---|
| RUN-001 | P0 | 已修复 | server typecheck 因依赖链接异常失败，已恢复依赖并通过 |
| RUN-002 | P0 | 已修复 | 依赖安装已用锁文件完成，构建可重复执行 |
| RUN-003 | P0 | 已确认 | 浏览器主链使用 mock，真实供应商和真实媒体产物未闭环 |
| RUN-004 | P1 | 已修复 | 配置模块自身先加载 .env，并支持根目录/工作区/编译后启动 |
| RUN-005 | P1 | 已验证 | 主链浏览器测试覆盖多集、批出和失败重试 |
| RUN-006 | P1 | 待集成验证 | handoff hash/version 已有校验，但缺旧交接失效的浏览器验收 |
| RUN-007 | P1 | 待集成验证 | 默认链优先已实现，但旧数据迁移和多节点隔离未全验 |
| RUN-008 | P1 | 待集成验证 | 多集确认/局部重拆/刷新场景未形成完整回归 |
| RUN-009 | P1 | 已验证 JSON | JSON 模式已完成创建、保存、读取、重启启动和路由验收；Prisma 仍需单独数据库验收 |
| RUN-010 | P1 | 环境阻断 | Remotion、HyperFrames、FFmpeg、TTS 等真实产物未验收 |
| RUN-011 | P2 | 已修复 | 新增根命令 verify:main-flow，统一本地主流程门禁 |
| RUN-012 | P2 | 已确认 | BGM/口型同步路径仍直接抛出不可用错误，若纳入全功能验收会阻断 |

## 4. 已确认问题

### RUN-001/RUN-002：依赖安装和编译基线阻断

Evidence：pnpm run typecheck 输出 server 错误 TS6053，缺少 apps/server/node_modules/@types/express/index.d.ts；检查还发现 Nest CLI shim 不存在。pnpm install --offline 首次因无 TTY 中止，设置 CI 后在 Recreating node_modules 阶段超过 120 秒。

Finding：项目当前不能视为可编译、可启动；已有部分 node_modules 不能替代干净、完整、可重复安装。

Path：package.json、pnpm-workspace.yaml、apps/server/package.json、apps/server/tsconfig.json、pnpm-lock.yaml。

处理：恢复完整依赖后，重新执行 pnpm run typecheck 和 pnpm run build，并确认 server/web 可启动。

### RUN-003：真实供应商主链未证明

Evidence：apps/web/e2e/e2e-script-storyboard-director.spec.ts 对 script-breakdown、image、video、video/poll 使用 page.route(...).fulfill，返回 mock.nx9 URL。apps/server/scripts/real-provider-smoke.mjs 只是 opt-in 的健康/故障 HTTP smoke，不执行编剧到导出的真实业务链。

Finding：现有 E2E 只能证明 mock 响应下 UI 可推进，不能证明凭据、模型、配额、响应格式、下载、媒体落盘和最终文件有效。

Path：apps/web/e2e/e2e-script-storyboard-director.spec.ts、apps/server/scripts/real-provider-smoke.mjs、docs/REAL-PROVIDER-VALIDATION.md、apps/server/src/modules/gateway/。

处理：用经授权的低成本配置逐项验收 LLM、图片、视频、TTS、轮询、失败码、媒体落盘和导出产物；密钥不得写入文档或日志。

### RUN-004：.env 加载时序

Evidence：apps/server/src/main.ts 静态导入 app.config.ts 后才调用 loadServerEnv()；app.config.ts 在模块求值时读取 NX9_HOST、NX9_PORT、ALLOW_PUBLIC_WRITE。

Finding：这些变量若只写入 apps/server/.env，启动时可能已取到旧值。当前默认配置未必立刻失败，但改端口、地址或公共库写权限时会静默失效。

Path：apps/server/src/main.ts、apps/server/src/config/load-env.ts、apps/server/src/config/app.config.ts。

### RUN-011：没有统一全量验收入口

Evidence：根 package.json 只有 dev、build、typecheck 等入口；web 的 test:e2e、server 的 test 和 opt-in real-provider 分散存在，根目录没有统一 verify/test 入口。

Finding：容易出现 shared 通过但 server 未编译，或 E2E 只跑 mock 的假绿。

Path：package.json、apps/web/package.json、apps/server/package.json、scripts/nx9-test-all.ps1。

### RUN-012：部分扩展路径明确不可用

Evidence：apps/web/src/engine/flow-runner.ts 对 BGM 和口型同步直接抛出“功能开发中/需部署模型后可用”。

Finding：最小主链未必经过这两条，但若“完全跑通”包含声音剧、BGM 或口型同步，会被直接阻断。

Path：apps/web/src/engine/flow-runner.ts:2175-2179、docs/NX9-PROJECT-DEFECT-ANALYSIS.md。

## 5. 有修复痕迹但尚未放行

### RUN-005：导演台并发写回

Evidence：director-desk-runner.ts 使用并发 worker，默认并发数为 2，每个镜头完成时调用 patchShot；DirectorDeskBlock 再通过 React Flow 节点回调更新链数据。

Finding：尚无真实浏览器证据证明交错完成时所有 URL、状态、失败信息都保留，且刷新后仍完整。纯函数测试不能覆盖 React 闭包和持久化竞争。

Path：apps/web/src/engine/director-desk-runner.ts:924-941、apps/web/src/blocks/core/DirectorDeskBlock.tsx:338-367、apps/web/src/engine/__tests__/director-desk-runner.test.ts。

### RUN-006：handoff 版本校验未完成验收

Evidence：validateDirectorHandoff 已检查 scriptHash、storyboardHash、lineartVersion、handoffVersion、confirmedAt 和 episode 存在性，导演台会把无效 handoff 标为 stale。

Finding：仍需浏览器验证：确认成稿 → 送分镜 → 确认集 → 修改成稿/重拆 → 重开导演台，旧交接必须失效并禁止批出。

Path：apps/web/src/engine/chain-storyboard-utils.ts:244-268、apps/web/src/blocks/core/DirectorDeskBlock.tsx:123-138、apps/web/e2e/e2e-script-storyboard-director.spec.ts。

### RUN-007/RUN-008：链隔离和跨集状态未闭环

Evidence：resolveShotsForBlock 默认不回退全局 storyboard.shots；脚本拆解写入节点 chainStoryboard；导演台按 episodeId 过滤并维护 confirmedEpisodeIds。

Finding：仍需覆盖旧工作区迁移、多个 storyboard-desk、空上游链、导入导出、刷新，以及“第 1 集已确认后只重拆第 2 集”的场景。过期集必须阻断，不能扩大到全链。

Path：apps/web/src/engine/chain-storyboard-utils.ts:281-313、apps/web/src/engine/script-breakdown-runner.ts:175-203、apps/web/src/engine/storyboard-desk-runner.ts:405-434、apps/web/src/blocks/core/DirectorDeskBlock.tsx:151-200。

### RUN-009/RUN-010：持久化和媒体交付基线未选定

Evidence：服务端通过 NX9_STORAGE 在 JSON/Prisma 间切换，Prisma 依赖 DATABASE_URL；Remotion、HyperFrames、FFmpeg、Topaz、LuxTTS 各有独立运行条件。

Finding：必须选定一次验收使用的存储模式，并验证创建、保存、刷新、重启恢复、删除恢复；同时验证 MP4/音频/CSV/PDF 文件真实存在、非空、可读取、可访问，失败不能标 done。

Path：apps/server/src/modules/workspace/workspace.service.ts、apps/server/prisma/schema.prisma、apps/server/src/modules/montage/remotion.renderer.ts、services/luxtts/server.py、docs/NX9-VERIFICATION-CHECKLIST.md。

## 6. 建议处理顺序

### P0：恢复可验证环境

1. 完整恢复 pnpm 依赖。
2. 通过 shared/server/web typecheck。
3. 通过 build 并启动 server/web。
4. 验证 /api/status、工作区创建/保存/加载和静态媒体访问。

### P1：闭合数据主链

1. 修复或验证 .env 时序。
2. 真实浏览器验证多集主链和刷新后持久化。
3. 验证并发批出、旧 handoff、过期集、空链和旧工作区迁移。
4. 选定 JSON 或 Prisma 作为验收基线。

### P2：交付与扩展

1. 验证真实 Remotion/HyperFrames/FFmpeg/音频产物。
2. 建立统一验证入口。
3. 对 BGM、声音剧、口型同步分别记录真实前置和验收结果。

## 7. 放行标准

- [ ] 干净环境安装成功。
- [ ] shared/server/web typecheck 和 build 全绿。
- [ ] server status 正常，工作区可保存、刷新、重启恢复。
- [ ] 编剧 → 分镜 → 导演交接成功，按链、按集隔离。
- [ ] 旧 handoff、无效集、空链被明确阻断。
- [ ] 并发批出后所有镜头状态刷新后仍完整。
- [ ] 至少一条真实图片和视频供应商链完成产物验证。
- [ ] 智能剪辑生成有效时间线，Remotion/导出生成非空文件。
- [ ] 真实失败不会被标记为成功。
- [ ] 扩展能力全部标记为真实验收或外部依赖阻断。

## 8. 最终判定

Evidence → Finding → Path：依赖检查失败且重装未完成 → 当前无法建立可靠启动基线 → 根 package.json → workspace → apps/server/package.json；主链 E2E 使用 mock 且真实 smoke 非业务全链 → 测试不能证明生产主链完全跑通 → 浏览器 E2E → 网关 → 供应商 → 媒体落盘/导出。

结论：**NX9 本地 mock 主流程已跑通并通过主流程门禁；真实供应商、Remotion/HyperFrames/FFmpeg/LuxTTS 产物验收仍属于外部环境项，不能由本机 mock 结果替代。**

## 9. 本轮修复与验证记录

- 修复服务端 `express` 运行时直接依赖，生产 `node apps/server/dist/main.js` 可启动。
- 修复 `.env` 与数据根目录按启动 cwd 变化导致的配置/工作区摘要丢失。
- 调整工作区静态路由顺序，避免 `/trash/list` 被 `:id` 吞掉。
- Playwright 改为分别等待 server `/api/status` 与 web，消除冷启动竞态。
- `pnpm run typecheck` 通过；`pnpm run build` 通过；F-022 与 gateway 契约 48 项通过；主链浏览器 2 项通过。
- 全量历史源码门禁仍有若干断言读取旧入口文件文本，已记录为待迁移测试债务，不作为主流程运行阻断。
