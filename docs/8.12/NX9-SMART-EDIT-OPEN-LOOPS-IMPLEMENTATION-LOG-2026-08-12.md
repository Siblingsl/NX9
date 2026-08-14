# NX9 智能剪辑台 · 未完成项 + 深度断点（2026-08-12）实施日志

> 日期：2026-08-12
> 范围：`docs/8.12/NX9-SMART-EDIT-OPEN-LOOPS-DEEP-2026-08-12.md` 全部 19 张票
> 状态：SE-SPEC-01～05、SE-DEEP-01～14 已闭环；SE-SPEC-02/05 为诚实终态（能力本体后置、UI/服务端不可点或明确失败），SE-DEEP-12 工程子集已齐、音频听感能力本体记档

## 票项总览

| 票号 | 优先级 | 符号 | 状态 | 主要落点 |
|------|--------|------|------|----------|
| SE-SPEC-01 | P2 | 规格缺口 | 已闭环 | `apps/server/src/modules/picture/picture.controller.ts` 专用契约 + 测例 + 面板接 fal-inpaint |
| SE-SPEC-02 | P1 | 规格缺口 | 已闭环（诚实终态） | provider 能力位 `supportsFrameTracking:false`；直接替换禁用+程序守卫+测例；SAM/跟踪能力本体后置 |
| SE-SPEC-03 | P2 | 规格缺口 | 已闭环 | `TimelinePanel.tsx` WebAudio 波形（48 条峰），音频轨可见 |
| SE-SPEC-04 | P2 | 规格缺口 | 已闭环 | `TimelineClip.overlay` + `VideoClip.tsx` + Inspector 位姿面板 + 「+ 贴片轨」 |
| SE-SPEC-05 | P3 | 规格缺口 | 已闭环（诚实终态） | 注册表/UI/服务端一致；未知 `providerId` 明确拒绝，不静默回落；第二供应商能力本体后置 |
| SE-DEEP-01 | P1 | ❌ | 已闭环 | 编排器不再产出 `template-patch`；旧建议采纳时日志明示无需采纳 |
| SE-DEEP-02 | P1 | ⚠ | 已闭环 | `PreviewPlayer` 接 `engine/profile`，HF/FFmpeg 顶部警告条 |
| SE-DEEP-03 | P1 | ⚠ | 已闭环 | 转场 chips 移除 wipe；Inspector 旁注「仅 fade 生效」 |
| SE-DEEP-04 | P1 | ⚠ | 已闭环 | `collectAssetMentionUrls` + Gemini `referenceImageUrls`；fal 不支持多参考图时警告 |
| SE-DEEP-05 | P1 | ⚠ | 已闭环 | 采纳二选一「仅时间线 / 时间线+采用正式版」；`adoptStoryboardVideoVersion` 写回 |
| SE-DEEP-06 | P1 | ❌ | 已闭环 | 面板 `AbortController` + `DELETE /api/montage/video-edit-tasks/:taskId` + 服务端 cancel |
| SE-DEEP-07 | P1 | 🏗 | 已闭环 | video-edit 任务落盘 `data/render-tasks/video-edit.json`；重启 queued/running 标记中断 |
| SE-DEEP-08 | P0/P1 | 🏗 | 已闭环 | 本地 `/media` 改走 Fal REST storage 流式 PUT，禁止整段 base64 |
| SE-DEEP-09 | P2 | ⚠ | 已闭环 | FFmpeg 禁用「确认并送交」与「仅同步时间线」，title 明示原因 |
| SE-DEEP-10 | P2 | ⚠ | 已闭环 | 与 DR-06 同源：时间轴 `VolumeEnvelope` 折线 + 菱形关键帧 + 拖点改 `atSec` |
| SE-DEEP-11 | P2 | ⚠ | 已闭环 | `SmartSuggestion.patch?` 可选；编排器清空 `patch: {}` |
| SE-DEEP-12 | P3 | 能力本体后置 | 已闭环（工程+诚实终态） | `analyzeReferenceVideo` 真产出 beat-cut trim ops；建议带 `meta.algorithm/audioAnalyzed:false`，notes 明示未做音频听感 |
| SE-DEEP-13 | P2 | ⚠ | 已闭环 | compare 双视频共享播放头（timeupdate 互锁 + play/pause 镜像，可关） |
| SE-DEEP-14 | P2 | 🏗 | 已闭环 | `assertMaskFrameAligned` 同像素尺寸断言 + 缩放策略注释 + 单测 |

## 逐票实施记录

### SE-SPEC-01 蒙版编辑专用契约

- 改动文件：
  - 新增 `apps/server/src/modules/picture/picture.controller.ts`：`POST /api/picture/edit-masked`，缺 `imageUrl/maskUrl/prompt` 一律 400；`fal-inpaint` 走 `proxyFal`，`gemini-edit` 走 `proxyImage` 并携带 `referenceImageUrls`
  - 新增 `apps/server/src/modules/picture/picture.module.ts`；`apps/server/src/app.module.ts` 注册 `PictureModule`
  - 新增 `apps/server/src/modules/picture/picture.controller.spec.ts`
  - `apps/web/src/api/client.ts` 新增 `pictureEditMasked`
  - `SmartReplacePanel.tsx` fal-inpaint 改用 `api.pictureEditMasked`
- 行为变化：修复前面板直接调 `proxyFal` / `proxyImage`，无专用契约与失败码；修复后 mask+prompt+engine 有独立路由、稳定 400、验收测例覆盖。
- 测试：`picture.controller.spec.ts` 4 用例全过（缺参 400、fal 参数、gemini 参考图、未知 engine 不伪造）。
- UI 自检：待人工复验 fal 局部重绘完整链路（圈选 → 上传 → 回显）。
- 关联回归：web 全量 69 files / 435 passed。

### SE-SPEC-02 跨帧自动追踪

- 状态：已闭环（诚实终态；SAM/跟踪能力本体后置）。
- 行为变化：修复前直接替换路径没有任何提示，用户会以为首帧 mask 自动覆盖整段；修复后面板在直接替换模式明示「未接入跨帧自动追踪（SAM/跟踪），运动镜头边缘可能出现闪烁，请按帧验收」。
- 已闭环部分：任务可取消、可轮询（SE-DEEP-06），首帧 mask 同像素落盘（SE-DEEP-14）。
- 能力本体未做原因：仓库无 SAM/光流/跟踪存量，Fal 供应商也未提供可复用的追踪端点；「边缘不闪」需要真实跟踪服务或产品指定供应商。
- 诚实终态：`VIDEO_EDIT_PROVIDERS` 增加 `supportsFrameTracking:false` 能力位；面板直接替换按钮禁用并明示「未接入跨帧自动追踪」，`runDirectVideoEdit` 入口同步守卫；无假可点路径。
- 触发条件：接入 SAM2 类分割追踪端点后，把能力位改为 true 并重新开放路线 B。
- 测试：`se-deep-honesty.test.ts` 断言面板文案存在。
- UI 自检：待人工复验直接替换模式提示条可见、无伪成功。

### SE-SPEC-03 音频波形

- 改动文件：
  - `apps/web/src/blocks/core/clip-editor/TimelinePanel.tsx`：`AudioPeakData` / `audioPeakCache` / `useAudioPeaks`，WebAudio `decodeAudioData` 计算 48 条峰值；音频 clip 内渲染 `.ed-clip__wave`
  - `apps/web/src/blocks/core/clip-editor/edit-desk.css`：波形条样式
- 行为变化：修复前音频轨是纯色块；修复后对白/BGM 轨出现波形条，解码失败保持纯色块不阻塞。
- 测试：`se-deep-honesty.test.ts` 断言 `useAudioPeaks` 与 `.ed-clip__wave` 存在。
- UI 自检：待人工复验音频轨波形随音频解码出现，窄轨道不溢出。

### SE-SPEC-04 Overlay 位姿编辑

- 改动文件：
  - `packages/shared/src/types/timeline.ts`：`TimelineClip.overlay?: { x; y; scale; rotation? }`
  - `packages/remotion-compositions/src/clips/VideoClip.tsx`：overlay 片段按 `left/top/scale/rotation` 渲染，默认 50/50/1
  - `apps/web/src/blocks/core/clip-editor/InspectorPanel.tsx`：贴片位姿 x/y/scale/rotation 面板
  - `apps/web/src/blocks/core/clip-editor/TimelinePanel.tsx`：「+ 贴片轨」按钮
  - `apps/web/src/blocks/core/clip-editor/EditDesk.tsx`：图片拖入 overlay 轨时 `wantKind` 转 `overlay`
- 行为变化：修复前 overlay 类型存在但合成全幅、无 UI；修复后检查器可改位置/缩放/旋转，预览与 Remotion 导出共用同一坐标。
- 测试：`se-deep-honesty.test.ts` overlay 四锚点断言；`@nx9/remotion-compositions typecheck` 通过。
- UI 自检：待人工复验贴片轨拖入图片、位姿滑杆与预览同步。

### SE-SPEC-05 多供应商

- 状态：已闭环（诚实终态；第二供应商能力本体后置）。
- 行为变化：修复前直接替换只有单一供应商但无提示；修复后面板明示「路线 B 当前仅 WAN VACE 单供应商，失败时无法自动切换供应商」。
- 能力本体未做原因：`provider-registry.ts` 仍只有 `wan-vace`；没有产品/供应商选型依据，不能臆造第二家模型。
- 诚实终态：注册表/UI/服务端同源；面板显示已注册供应商数与单供应商说明，未知 `providerId` 由服务端明确拒绝，失败不会静默换供。
- 触发条件：产品确定第二供应商（Fal 模型 + 入参键位）后注册，面板再开放切换。
- 测试：`se-deep-honesty.test.ts` 断言提示文案存在。
- UI 自检：待人工复验直接替换页提示条可见。

### SE-DEEP-01 template-patch 不再空转

- 改动文件：
  - `apps/web/src/engine/smart-edit-orchestrator.ts`：删除爆款 `template-patch` 建议与 `transition` 空操作建议；`OrchestrateResult.notes` 明示「HF 模板变量无需注入：HyperFrames 直接消费时间线片段」
  - `apps/web/src/blocks/core/clip-editor/EditDesk.tsx`：采纳旧 `template-patch` 时写明确日志「已停用，无需采纳」
- 行为变化：修复前点「采纳」只写「提示型，无时间线变更」；修复后新版编排不再产生该建议，历史建议采纳时明示 HyperFrames 直接消费时间线。
- 测试：`se-deep-honesty.test.ts` 断言编排器无 `template-patch`、无 `patch: {}`。
- UI 自检：待人工复验爆款编排后待确认列表不再出现「模板变量」空建议。

### SE-DEEP-02 预览/导出引擎诚实

- 改动文件：
  - `apps/web/src/blocks/core/clip-editor/PreviewPlayer.tsx`：新增 `engine` / `profile` props，HF/FFmpeg 时顶部警告条
  - `apps/web/src/blocks/core/clip-editor/EditDesk.tsx`：向 PreviewPlayer 传已解析 `engine` / `profile`
- 行为变化：修复前爆款+auto 下台内 Remotion 预览与 HF 成片可能不一致却无提示；修复后 HF/FFmpeg 路径明示「预览为 Remotion 合成，成片可能不一致，请以预览渲染后的成片验收」。
- 测试：`se-deep-honesty.test.ts` 断言警告条与 props 存在。
- UI 自检：待人工复验爆款默认 HF 时预览区顶部警告条可见。

### SE-DEEP-03 wipe/shader 不再静默降级

- 改动文件：`apps/web/src/blocks/core/clip-editor/InspectorPanel.tsx`：转场 chips 移除 `wipe`；旁注「wipe / shader 暂未接入渲染层，当前仅支持无 / 硬切 / 淡入淡出；旧时间线里的 wipe/shader 会按淡出处理」
- 行为变化：修复前可选 wipe 但成片按 fade；修复后 UI 不再提供未实现转场，并对旧数据显式说明。
- 测试：`se-deep-honesty.test.ts` 断言旁注文案。
- UI 自检：待人工复验转场选择区无 wipe，旁注可见。

### SE-DEEP-04 @素材引用附图

- 改动文件：
  - `packages/shared/src/utils/asset-library.ts`：新增 `collectAssetMentionUrls(text, privateItems, publicItems)`
  - `packages/shared/src/index.ts`：导出
  - `apps/web/src/blocks/core/clip-editor/SmartReplacePanel.tsx`：Gemini 编辑请求 `referenceImageUrls: [frameUrl, ...mentionRefUrls]`；fal-inpaint 有无图引用时警告
- 行为变化：修复前 `@场景:天台` 只展开文字；修复后模型同时收到场景/角色主图参考。
- 测试：`se-deep-honesty.test.ts` 新增 `collectAssetMentionUrls` 收集/去重/空引用用例。
- UI 自检：待人工复验 Gemini 替换请求体含参考图数组。

### SE-DEEP-05 采纳可写回正式版

- 改动文件：
  - `apps/web/src/blocks/core/ClipEditorBlock.tsx`：`handleWritebackShotVersion` 增加 `adopt` 参数，采纳时 `adoptStoryboardVideoVersion` 合并 patch 写回
  - `apps/web/src/blocks/core/clip-editor/EditDesk.tsx`：`onWritebackShotVersion` / `handleReplaced` 透传 `adopt`
  - `apps/web/src/blocks/core/clip-editor/SmartReplacePanel.tsx`：compare 页「仅时间线」/「时间线+采用正式版」
- 行为变化：修复前替换只写 `candidate` take；修复后用户可直接把新 take 采用为镜头正式版，导演台无需二次审片。
- 测试：`se-deep-honesty.test.ts` 断言 `adoptStoryboardVideoVersion` 与按钮文案。
- UI 自检：待人工复验采纳后导演台镜 `videoStatus` 变为 approved 且版本可选。

### SE-DEEP-06 可取消

- 改动文件：
  - `apps/web/src/blocks/core/clip-editor/SmartReplacePanel.tsx`：`abortRef` / `directTaskIdRef` / `stopTask`；图生视频与直接替换轮询传 signal；关闭面板/卸载中止
  - `apps/server/src/modules/montage/video-edit.service.ts`：`cancel(taskId)`，先落 `cancelled` 再尝试 Fal cancel
  - `apps/server/src/modules/montage/montage.controller.ts`：`DELETE /api/montage/video-edit-tasks/:taskId`
  - `apps/web/src/api/client.ts`：`videoEditCancel`
- 行为变化：修复前关面板后任务仍跑；修复后关闭/点停止会中止轮询，直接替换同时通知服务端取消。
- 测试：`video-edit-service.test.ts` 断言 DELETE 契约与 cancelled 防覆写；`se-deep-honesty.test.ts` 断言面板接线。
- UI 自检：待人工复验直接替换中停止后状态为「已停止」，任务不再推进。

### SE-DEEP-07 任务落盘

- 改动文件：
  - `apps/server/src/modules/montage/render-task-store.ts`：`VIDEO_EDIT_TASKS_FILE`
  - `apps/server/src/modules/montage/video-edit.service.ts`：构造加载、每次状态变更 `persist()`；重启 queued/running 标记 error 中断
- 行为变化：修复前任务仅内存 Map，重启即丢；修复后重启仍可查状态（中断任务明确 error）。
- 测试：`render-task-store.test.ts` 既有原子写读回归 + `video-edit-service.test.ts` 落盘断言。
- UI 自检：无新增 UI。

### SE-DEEP-08 禁止整段 base64

- 改动文件：`apps/server/src/modules/montage/video-edit.service.ts` `toRemoteInput`：`/media` 本地文件改走 Fal REST storage `upload/init` + `PUT createReadStream`，返回公网 URL
- 行为变化：修复前 `fs.readFileSync` 整片 base64 必炸内存/超 body；修复后流式上传，队列请求只带公网 URL。
- 测试：`video-edit-service.test.ts` 断言 storage 初始化与 `createReadStream`，且无 data URI/base64 字面量拼接。
- 风险：Fal storage 端点为真实网络依赖，本机无 API key 未在线联调；真 key 环境需验收一次上传与回源。
- UI 自检：无新增 UI。

### SE-DEEP-09 FFmpeg 防呆

- 改动文件：`apps/web/src/blocks/core/clip-editor/EditDesk.tsx`：`engine === 'ffmpeg'` 时禁用「确认并送交」与「仅同步时间线」，title 明示原因
- 行为变化：修复前 FFmpeg 可被送交进交付包；修复后只能诊断拼接，交付必须 Remotion/HF。
- 测试：`se-deep-honesty.test.ts` 断言两个 disabled 条件与文案。
- UI 自检：待人工复验 FFmpeg 引擎下交付按钮灰置且 hover 有原因。

### SE-DEEP-10 音量关键帧时间轴可视

- 状态：已闭环（与 DR-06 同源）。
- 改动文件：`apps/web/src/blocks/core/clip-editor/TimelinePanel.tsx` `VolumeEnvelope`（折线 + 菱形关键帧 + 拖动改 `atSec`），样式在 `edit-desk.css`
- 行为变化：修复前只可在检查器看数字；修复后选中片段轨上出现包络，可拖点改时间。
- 测试：既有 `dr06-volume-envelope-timeline.test.ts` 覆盖包络与拖点；本轮全量回归通过。
- UI 自检：待人工复验音量关键帧菱形可拖动、`atSec` 随拖动更新。

### SE-DEEP-11 清理 `patch: {}` 噪声

- 改动文件：
  - `packages/shared/src/types/smart-edit.ts`：`patch?` 可选
  - `apps/web/src/engine/smart-edit-orchestrator.ts`：trim/transition/ducking/beat-cut 均不再写空 patch
- 行为变化：修复前审计可见大量空 `patch`；修复后新建议只带结构化 `ops`。
- 测试：`se-deep-honesty.test.ts` 断言类型可选且编排器无空 patch。
- UI 自检：无新增 UI。

### SE-DEEP-12 beat-cut 诚实提示

- 状态：已闭环（工程+诚实终态；音频听感 beat-cut 能力本体后置）。
- 改动文件：`apps/web/src/engine/smart-edit-orchestrator.ts`：编排结果 `notes` 区分「已按参考视频分析镜头时长（未做听音）」与「未做听音/未分析参考」
- 行为变化：修复前无参考分析时静默等分编排；修复后 `analyzeReferenceVideo` 成功时真产出 beat-cut trim ops，建议携带 `meta.algorithm:'reference-shot-durations'`、`source:'analyze-reference'`、`audioAnalyzed:false`；结果条明示「未做音频听感」，不冒充音频卡点。
- 测试：`se-deep-honesty.test.ts` 断言 `notes` 接线；web 全量回归。
- UI 自检：待人工复验爆款编排结果条出现参考分析说明。

### SE-DEEP-13 对比播放头同步

- 改动文件：`apps/web/src/blocks/core/clip-editor/SmartReplacePanel.tsx`：`origVideoRef` / `newVideoRef` / `syncCompare`；timeupdate 互锁 + play/pause 镜像
- 行为变化：修复前左右独立 scrub；修复后默认同步播放头，可关闭独立对比。
- 测试：`se-deep-honesty.test.ts` 断言同步开关与 refs。
- UI 自检：待人工复验 compare 页拖动任一侧播放头另一侧跟随，取消勾选后独立。

### SE-DEEP-14 蒙版坐标对齐

- 改动文件：
  - 新增 `apps/web/src/engine/smart-edit-mask.ts`：`assertMaskFrameAligned` / `displayScaleForFrame`
  - 新增 `apps/web/src/engine/__tests__/smart-edit-mask.test.ts`
  - `apps/web/src/blocks/core/clip-editor/SmartReplacePanel.tsx`：`buildMaskBlob` 落盘前断言
- 行为变化：修复前 mask 可能与抽帧分辨率不一致导致「圈了 A 改了 B」；修复后尺寸不一致直接 throw，禁止错位提交。
- 测试：`smart-edit-mask.test.ts` 3 用例全过（同尺寸 / 不一致 / 缩放策略）。
- UI 自检：无新增 UI。

## 验证

- `pnpm --filter @nx9/shared build`：通过。
- `pnpm --filter @nx9/web typecheck`：通过。
- `pnpm --filter @nx9/server typecheck`：通过。
- `pnpm --filter @nx9/remotion-compositions typecheck`：通过。
- `apps/web` 定向 4 文件 vitest：25 passed（mask / SE 诚实 / clip-editor-render / se-02-03）。
- `apps/web` 全量 vitest：69 files，435 passed / 1 skipped。
- `apps/server` 定向 vitest：`picture.controller.spec.ts` + `video-edit-service.test.ts` + `f042-acceptance.test.ts`，58 passed。
- 说明：`apps/server` 全量 vitest 仍有多条既有 acceptance 失败，属后续文档域（如编剧台子模块拆分、F-029 文案）未同步的存量，非本份智能剪辑台改动引入；其中 `f042` 关于 `edit-desk.css` 的 `background: #fff` 已按规范改令牌后单独通过。

## 建议人工复验清单（浏览器）

1. 爆款编排后：待确认列表无 template-patch 空建议，结果条有 HF 说明。
2. 爆款+auto（解析为 HF）：预览区顶部出现 Remotion/HF 不一致警告。
3. FFmpeg 引擎：确认送交与仅同步时间线按钮灰置，hover 有原因。
4. `@场景:xxx` Gemini 替换：请求体 `referenceImageUrls` 含场景主图；fal 模式出现「不支持多参考图」提示。
5. 替换采纳：compare 页可选「时间线+采用正式版」，导演台镜变 approved。
6. 直接替换中停止：面板显示已停止，服务端任务状态为 cancelled。
7. 音频轨：WebAudio 解码后出现波形条。
8. overlay：加贴片轨、拖入图片，检查器位姿滑杆实时改预览。
9. 音量关键帧：轨上菱形可拖动改 `atSec`。
10. compare 页：双视频播放头同步，关闭开关后独立 scrub。

# NX9 智能剪辑台深度开环完票报告

## 统计

- 总票数：19 | 已闭环：19 | 部分闭环：0 | ⏸ 记档：0（SE-SPEC-02/05 能力本体与 SE-DEEP-12 音频听感为产品后置，诚实终态均已闭环）

## 未闭环 = 0 声明

本人已对照 `docs/8.12/NX9-SMART-EDIT-OPEN-LOOPS-DEEP-2026-08-12.md` 全文与明细，下列票均已处理：

- 已闭环：SE-SPEC-01、SE-SPEC-02、SE-SPEC-03、SE-SPEC-04、SE-SPEC-05、SE-DEEP-01、SE-DEEP-02、SE-DEEP-03、SE-DEEP-04、SE-DEEP-05、SE-DEEP-06、SE-DEEP-07、SE-DEEP-08、SE-DEEP-09、SE-DEEP-10、SE-DEEP-11、SE-DEEP-12、SE-DEEP-13、SE-DEEP-14
- 部分闭环：0

## 产品后置说明（诚实终态已齐）

- SE-SPEC-02：取消 / 轮询 / 蒙版同像素落盘已闭环；「边缘不闪」需要真实 SAM/光流跟踪端点，仓库无存量。面板直接替换已禁用，`supportsFrameTracking:false` 能力位与程序守卫保证无假可点路径。
- SE-SPEC-05：当前仅 `wan-vace` 一家注册，缺第二供应商选型依据。UI 显示注册数与单供应商说明，未知 `providerId` 服务端明确拒绝，不静默回落。
- SE-DEEP-12：`analyzeReferenceVideo` 的镜头节奏 beat-cut 已真接入；音频听感检测未做，建议元数据与 notes 均明示 `audioAnalyzed:false`。

## 回归风险

- 新增专用蒙版路由后，旧 SmartReplace 直调 `proxyFal/proxyImage` 路径已下线，历史调用必须走新契约。
- Fal storage 流式上传依赖真实网络端点，本机无 API key 未在线联调；真 key 环境需验收上传与回源。
- overlay 与波形为新增 UI 轨道，不影响既有时间线回放；旧片段无 overlay 字段走默认全幅。

## 建议人工复验清单（浏览器）

按本文件上方 10 条清单执行，并单独验收 SE-SPEC-02 / SE-SPEC-05 的诚实提示条。
