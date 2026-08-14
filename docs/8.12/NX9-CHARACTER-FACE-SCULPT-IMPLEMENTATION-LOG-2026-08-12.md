# NX9 角色捏模台 · P2/P3 与诚实边界实施日志（2026-08-12）

> 日期：2026-08-12
> 范围：`docs/8.12/NX9-CHARACTER-FACE-SCULPT-2026-08-12.md` 的 P2/P3 未闭环清单与诚实边界
> 状态：FACE-02 / FACE-03 / FACE-04 / FACE-05 / FACE-06 / FACE-08 / FACE-09 / DRIFT-01 / DRIFT-02 / DRIFT-03 / DRIFT-05 / DRIFT-06 / DRIFT-07 / HONEST-01 已闭环；FACE-01 / FACE-07 / DRIFT-04 工程子集已闭环（资产后置）；FACE-10 / HONEST-03 记档不实施；HONEST-02 回归确认

## 票项总览

| 票号 | 判定 | 状态 | 主要落点 |
|------|------|------|----------|
| FACE-01 | ❌ | 工程子集已闭环（资产后置） | `character-model-loader.ts`：正式 GLB 加载路径 + manifest 校验 + 失败/不合格回退代理；无资产时仍代理 |
| FACE-02 | ❌ | 已闭环 | `sculpt-handles.ts` + Scene 控制点拾取拖拽；松手才 commit |
| FACE-03 | ❌ | 已闭环 | 对称锁 UI + `sideValues` / `asymmetric` 扩展键驱动 L/R morph |
| FACE-04 | ❌ | 已闭环 | 机位键 F/S/Q/B/全览 + 台内 undo（≤50，Ctrl+Z） |
| FACE-05 | ❌ | 已闭环 | 独立 Renderer 固定像素 `exportCanonicalImage` → 上传 → `faceLockUrl` |
| FACE-06 | ❌ | 已闭环 | 健康条三项：未定妆 / 定妆过期 / 契约过期 |
| FACE-07 | ❌ | 工程子集已闭环（资产后置） | 加载路径/manifest 校验/契约回退已齐（B2）；`apps/web/public/director3d/models/README.md` 已补资产契约；GLB/LICENSE 仍待美术交付 |
| FACE-08 | ❌ | 已闭环 | `material-drivers.ts` 真驱动命名材质通道；无通道由 `sculpt-contract.ts` 标 missing（B3） |
| FACE-09 | ⏸ | 已闭环 | `stage-body-bridge.ts` + `StageActor` 已桥接 `faceRig.body`（身高/肩/躯干/腿/颈/手，B4） |
| FACE-10 | ⏸ | 记档 | 3D 表情 / 发型服装 / 照片拟合后置 |
| DRIFT-01 | ⚠ | 已闭环 | `meshContractVersion` / `faceLockHash` 入类型与归一化 |
| DRIFT-02 | ⚠ | 已闭环 | 补 `sculpt-cameras.ts` / `sculpt-lights.ts` / `sculpt-handles.ts` |
| DRIFT-03 | ⚠ | 已闭环 | 与 FACE-08 同源：材质驱动 + 无通道 missing 报告 |
| DRIFT-04 | ⚠ | 工程子集已闭环（资产后置） | 正式加载路径已接入并回退代理；正式资产到位后替换硬编码 `createProxyCharacter()` |
| DRIFT-05 | ⚠ | 已闭环 | 锁定角色 Modal 守卫提示 |
| DRIFT-06 | ⚠ | 已闭环 | P2/P3 布局落地，不再声称左窄条；不造空壳开关 |
| DRIFT-07 | ⚠ | 已闭环 | 兼容抽屉展开 missing 列表 |
| DRIFT-08 | ⚠ | 回归确认 | 文档 §5 已按代码收紧，无新增代码 |
| HONEST-01 | ⚠ | 已闭环 | 顶栏「工程代理 · 非成品基模」徽标 |
| HONEST-02 | ⚠ | 回归确认 | 非切片参数继续标「仅 Prompt」 |
| HONEST-03 | ⏸ | 记档（应用内已核验） | 应用内已无「真 3D 捏脸」宣称，捏模台保持「工程代理 · 非成品基模」徽标；对外宣传仍须按阶段诚实 |

## 逐票实施记录

### FACE-02 控制点拖拽

- 状态：已闭环
- 改动文件：
  - 新增 `packages/director3d/src/sculpt/sculpt-handles.ts`：`SCULPT_HANDLES` 覆盖切片 6 项（下颌 L/R、眼距 L/R、鼻梁、发际、肩 L/R、身高感），`applyHandleDrag` / `clampFaceRigValue` / `handleDefById` / `handleDefByName`
  - `packages/director3d/src/sculpt/CharacterSculptScene.ts`：`handleLayer` 橙色手柄球；pointerdown/move/up 拾取拖拽；拖中只改 state 与网格，松手 `onFaceRigCommit`
  - `packages/director3d/src/sculpt/CharacterSculptViewport.tsx`：透传 `onFaceRigCommit`
  - `apps/web/src/panels/asset-library/face-sculpt/FaceSculptModal.tsx`：拖拽松手 commit → 写库
- 行为变化：修复前只能拧滑块；修复后可拖橙点，拖 10s 不写库（无空闲 RAF，事件驱动），松手才落库。
- 测试：新增 `face-sculpt-p2-handles.test.ts`：手柄契约、y 轴方向、对称/非对称拖拽、边界 clamp、未知手柄、L/R morph 驱动。
- UI 自检：待人工复验：全屏台内拖下颌/肩点应实时变形且不掉帧。

### FACE-03 对称解锁

- 状态：已闭环
- 改动文件：
  - `packages/shared/src/types/creative-asset-center.ts`：`CharacterFaceRig.sideValues`
  - `packages/shared/src/utils/character-face-rig.ts`：`faceRigSideValue` / `setFaceRigSideValue`；`setFaceRigValue` 清该 id 的 sideValues；`resetFaceRigGroup` 清组内 sideValues；`faceRigHash` 纳入 sideValues；空 sideValues 不残留 key
  - `packages/director3d/src/sculpt/apply-face-rig.ts`：per-side L/R morph 与骨 scale；base=0 但单侧有值时仍写 L/R
  - `apps/web/.../FaceSculptModal.tsx`：对称联动 checkbox（Lock/Unlock 图标）
- 行为变化：修复前不对称只有字段没有网格效果；修复后解锁单侧拖点写 `sideValues` 并登记 `asymmetric`，未写一侧回退基础值，代理下颌 L/R morph 可见左右差。
- 测试：`character-face-rig.test.ts` 新增单侧读/写/清/重置/指纹 5 例；`face-sculpt-p2-handles.test.ts` 覆盖网格 L/R influence。
- UI 自检：待人工复验：解锁后拖右侧下颌，右变左不变；重新勾选对称后恢复左右一致。

### FACE-04 机位键与台内 undo

- 状态：已闭环
- 改动文件：
  - 新增 `packages/director3d/src/sculpt/sculpt-cameras.ts`：`SCULPT_CAMERA_PRESETS` / `applyCameraPreset`
  - `apps/web/.../FaceSculptModal.tsx`：F/S/Q/B/全览按钮与快捷键；`undoStackRef` ≤50，Ctrl+Z 回滚上一提交
- 行为变化：修复前构图靠手转、误拧难回；修复后命名机位一键切换，Ctrl+Z 回到拖前/提交前。
- 测试：机位预设与 undo 行为列入人工复验；`face-p3-lock-export.test.ts` 锚定机位常量与导出入口。
- UI 自检：待人工复验：F/S/Q/B 键切换机位；拖点后 Ctrl+Z 回拖前；undo 栈上限 50。

### FACE-05 定妆出图写 faceLockUrl

- 状态：已闭环（2026-08-12 真实浏览器 e2e 复验通过）
- 改动文件：
  - `packages/director3d/src/sculpt/CharacterSculptScene.ts`：`exportCanonicalImage(rig?)` 独立 Renderer、512×768 固定像素、克隆代理网格导出（不把预览 actor 移出 Scene）
  - `packages/director3d/src/sculpt/CharacterSculptViewport.tsx`：handle 暴露 `exportCanonicalImage`
  - `apps/web/.../FaceSculptModal.tsx`：定妆出图按钮 → dataURL → blob → `api.uploadAsset` → 写 `faceLockUrl`、`renderedAt`、`meshContractVersion`、`faceLockHash`
- 行为变化：修复前没有定妆截图；修复后捏完可出固定像素规范机位图，写回档案供详情头像与 ID LOCK。
- 测试：`face-p3-lock-export.test.ts` 锚定独立导出、克隆导出、Modal 写回字段与指纹。
- UI 自检：已复验（Playwright Chromium 2026-08-12）：点定妆出图后详情头像变、「定妆已锁」出现、上传 201、导出 PNG 512×768、page error 0；上传失败仍显示 error 文案（源码分支保持）。

### FACE-06 健康条三项

- 状态：已闭环
- 改动文件：
  - `apps/web/src/engine/asset-library-health.ts`：`assessCharacterFaceRigHealth`；character Tab 挂 `faceRigNotRendered` / `faceRigMetricConflict` / `faceRigMeshStale`
  - `apps/web/src/panels/asset-library/CharacterFaceRigSection.tsx`：健康条区块
  - `apps/web/.../FaceSculptModal.tsx`：定妆头像旁健康提示
- 行为变化：修复前参数改了无提示重截；修复后未定妆、指纹过期、契约过期分别亮提示，重新定妆后转绿。
- 测试：新增 `face-sculpt-health.test.ts`（7 例）：三项指标、健康全绿、参数改动转过期、台账计数与过滤。
- UI 自检：待人工复验：改参数后健康条亮，重截后灭。

### DRIFT-01 契约字段入类型

- 状态：已闭环
- 改动文件：`packages/shared/src/types/creative-asset-center.ts`（`meshContractVersion` / `faceLockHash`）、`packages/shared/src/utils/character-face-rig.ts`（归一化保留）
- 行为变化：修复前类型没有 `meshContractVersion`；修复后字段存在、归一化不丢、定妆写回时落库。

### DRIFT-02 补模块文件

- 状态：已闭环
- 改动文件：新增 `sculpt-cameras.ts` / `sculpt-lights.ts` / `sculpt-handles.ts` 并从 `packages/director3d/src/index.ts` 导出
- 行为变化：修复前文档声称存在而文件不存在；修复后三模块真实存在并被 Scene/Modal 使用。

### DRIFT-05 锁定角色守卫

- 状态：已闭环
- 改动文件：`apps/web/.../FaceSculptModal.tsx`：锁定角色时顶部警示「不会写入旧锁定快照，请先新建版本再编辑」
- 行为变化：修复前 Modal 无任何锁定提示；修复后接入现有 `consistency.locked` 流程并明确告知。

### DRIFT-06 UI 布局文案漂移

- 状态：已闭环（以实际布局收口）
- 说明：P2/P3 实际布局为「视口 + 浮动机位/中性对照 + 右栏面板（健康/对称/切片/全部参数/撤销/定妆）」；不新增空壳「左窄条头/身/灯光/输出」开关，避免假开关。原文档旧文案由本文档收口。

### DRIFT-07 兼容抽屉

- 状态：已闭环
- 改动文件：`apps/web/.../FaceSculptModal.tsx`：顶栏兼容徽章点开抽屉，列出 warning 与 missing 参数 id（超出 24 项折叠计数）
- 行为变化：修复前只有 tip；修复后点开可见完整 missing 列表。

### HONEST-01 工程代理徽标

- 状态：已闭环
- 改动文件：`apps/web/.../FaceSculptModal.tsx` 顶栏徽标「工程代理 · 非成品基模」
- 行为变化：修复前代理丑容易被当 bug；修复后入口即明示占位。

## ⏸ 后置项记档

| 票号 | 原因 | 触发条件 |
|------|------|----------|
| FACE-01 / DRIFT-04 | 仓库无 `nx9-character-base.glb`；B2 已接入 GLB 加载路径 + manifest 校验 + 回退代理，资产未到位时仍回退代理 | 美术交付基模 + manifest + LICENSE 后，正式资产自动替换代理（同一 `loadCharacterModel` / `applyFaceRigToObject`） |
| FACE-07 | 缺生产基模资产；加载路径/manifest 校验/契约回退已由 B2 闭环 | 美术按 §5 契约交付 MVP GLB（切片 4 脸 morph + Root/Clavicle） |
| FACE-08 / DRIFT-03 | 代码子集已闭环（命名材质通道真驱动、无通道 missing 报告）；代理自身无虹膜/眉/肤通道 | 正式 GLB 材质铺好后按同一 driver 直接生效 |
| FACE-09 | 代码子集已闭环（`stage-body-bridge` 桥接 faceRig.body）；正式基模资产仍未到位 | 正式基模资产到位后按同一桥接验收身段缩放 |
| FACE-10 | 身份未锁前做 3D 表情会变成「同一张脸演戏」 | P3 定妆闭环后再另开 |
| HONEST-03 | 非代码票；应用内已无「真 3D 捏脸」宣称，捏模台徽标保持「工程代理 · 非成品基模」 | 宣传「真 3D 捏脸」前必须完成 P4 |

## 2026-08-13 B2–B5 工程子集收口（矩阵 B 队列）

- B2（FACE-01 / FACE-07 / DRIFT-04 / DEEP-13）：新增 `packages/director3d/src/sculpt/character-model-loader.ts`：GLB/manifest 路径、`validateCharacterAssetManifest`、`loadCharacterModel` 加载→契约判定→失败/不合格回退代理；`CharacterSculptScene` 改动态 actor 并暴露 `loadCharacterModel()`，`CharacterSculptViewport` 挂载自动尝试加载；`apps/web/public/director3d/models/README.md` 补资产契约说明。单测 `character-model-loader.test.ts`。
- B3（FACE-08 / DRIFT-03）：新增 `packages/director3d/src/sculpt/material-drivers.ts`：有命名材质通道时真驱动属性；`sculpt-contract.ts` 将缺通道列为 missing，`apply-face-rig.ts` 不再无条件跳过。单测 `face-sculpt-material-driver.test.ts`。
- B4（FACE-09）：新增 `packages/director3d/src/runtime/stage-body-bridge.ts`（faceRig.body→身高/肩/躯干/腿/颈/手比例），`StageActor.tsx` 接入；`apps/web/src/engine/director3d-character-sync.ts` 将 `profile.creative.faceRig` 写入导演台对象（已有对象保留旧值），`DirectorObject.faceRig` 类型已补。单测 `stage-body-bridge.test.ts` + `director3d-character-sync.test.ts`。
- B1（DR-08 / VG-48 / DEEP-09）：核验 audioUrl 全部消费点，`ClipGenBlock.tsx` 文案改为「已连接上游音频 · 音画对齐能力未定，仅透传参考」；episode-queue 常量此前已删。
- B5（HONEST-03）：应用内无「真 3D 捏脸」宣称；捏模台徽标保持「工程代理 · 非成品基模」。

## 验证

- `pnpm --filter @nx9/shared build`：通过。
- `pnpm --filter @nx9/director3d typecheck`：通过。
- `pnpm --filter @nx9/web typecheck`：通过。
- 捏模定向 vitest（5 个文件）：62 passed。
  - `face-sculpt-p2-handles.test.ts`
  - `face-sculpt-health.test.ts`
  - `character-face-rig.test.ts`
  - `character-sculpt-p1.test.ts`
  - `face-p3-lock-export.test.ts`
- `apps/web` 全量 vitest：74 files，466 passed / 1 skipped。
- 2026-08-13 B2–B4 定向：`character-model-loader` / `face-sculpt-material-driver` / `stage-body-bridge` / `director3d-character-sync` 4 文件 11 passed；连同既有捏模测试 6 文件 53 passed。
- E2E（2026-08-13 复跑）：`face-sculpt-repro.spec.ts` 1 passed（定妆 201、PAGE_ERRORS 0、manifest 404 属资产未到位预期）；`e2e-script-storyboard-director.spec.ts` 2 passed。

# NX9 角色捏模台完票报告

## 统计

- 总票数：21 | 已闭环：17（含工程子集闭环 3：FACE-01、FACE-07、DRIFT-04） | ⏸ 记档：2（FACE-10、HONEST-03） | 回归确认：2 | 部分闭环：0

## 未闭环 = 0 声明

本人已对照 `docs/8.12/NX9-CHARACTER-FACE-SCULPT-2026-08-12.md` 全文与汇总表，下列票均已处理：

- 已闭环：FACE-02、FACE-03、FACE-04、FACE-05、FACE-06、FACE-08、FACE-09、DRIFT-01、DRIFT-02、DRIFT-03、DRIFT-05、DRIFT-06、DRIFT-07、HONEST-01
- 工程子集已闭环（资产后置）：FACE-01、FACE-07、DRIFT-04
- ⏸ 记档：FACE-10、HONEST-03
- 回归确认：DRIFT-08、HONEST-02

## 回归风险

- `sideValues` 新字段只影响新增写路径；`setFaceRigValue` 清 sideValues 后显式删除 key，历史 rig 无该字段不受影响。
- `apply-face-rig` 对 base=0 但单侧有值的情况新增写入分支；缺 morph/骨仍静默跳过，未接入参数行为不变。
- 定妆导出改为克隆代理网格，预览 actor 不再被移出 Scene；导出失败不影响预览。
- 机位快捷键只在 Modal 打开时挂 window listener，关闭即移除；不影响其它台。
- 工作区其余文件为前 8 份文档实施结果，本轮未触碰。

## 建议人工复验清单（浏览器）

1. 打开捏模台：顶部出现「工程代理 · 非成品基模」徽标。
2. 拖橙色控制点：松手才写库；Ctrl+Z 回拖前。
3. 解锁对称后拖单侧下颌：仅该侧变；重新锁定后左右一致。
4. F/S/Q/B 键切换机位；点击「定妆出图」后详情头像变，参数改动后健康条亮、重截后灭。
5. 兼容徽章点开抽屉：missing 列表与 warning 可见。
6. 锁定角色打开捏模台：出现「请先新建版本」提示。
7. 改窗口大小后再次定妆：导出仍为固定 512×768 像素。
