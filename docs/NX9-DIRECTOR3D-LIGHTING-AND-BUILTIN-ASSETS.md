# NX9 3D 导演台 · 电影级灯光 + 内置模型资产库

> 状态：本轮已实现（可编译、有单测、无 TODO/占位/mock）
> 范围：`packages/director3d`；宿主桥接（`apps/web/src/engine/director3d-*`）只新增了 shotState 环境字段的同步，未改动既有提交契约。

---

## 1. 能力范围

### 1.1 电影级灯光系统

| 能力 | 说明 |
| --- | --- |
| 24 个主光位 | 8 方位 × 3 高度（高位 55° / 平位 15° / 低位 -20°），与经典影视布光方位一致 |
| 9 个轮廓光预置 | 覆盖冷/暖色温、硬/柔质感、高位/低位背光 |
| 6 个环境光预设 | 摄影棚中性、冷调、暖调、暮色、夜色、高调白棚 |
| 8 组整组布光方案 | 三点布光、伦勃朗、蝴蝶光、黄昏逆光、赛博霓虹、审讯室、高调白棚、低调黑色电影 |
| 单灯全参数控制 | 类型（方向光/聚光灯/点光源/环境灯）、方位角、仰角、距离、强度、颜色、锥角、羽化、阴影开关、显隐、名称 |
| 环境与曝光 | 全局环境光强度、渲染器曝光 |
| 视角无关 | 面板在单视口与四视口下都可用（左侧竖排抽屉，移动端为 dock sheet） |

### 1.2 内置模型资产库

| 能力 | 说明 |
| --- | --- |
| 40 个程序化模型 | 家具 9 / 建筑构件 8 / 自然 6 / 载具 4 / 道具 10 / 屏幕板面 3 |
| 零外部文件 | 全部由 three.js 基础几何（box/sphere/cylinder/cone/plane）拼装，数据可序列化进 project |
| 8 个内置场景模板 | 客厅、卧室、办公室、教室、街道、森林、审讯室、摄影棚片场 |
| 一键可用 | 应用场景模板同时落地：模型 + 地面/背景色 + 整组布光 + 镜头位/目标点/FOV |

---

## 2. 方位约定（面板、渲染、prompt 三者共用）

```
azimuth 0°   = 主体正前方（与导演台默认机位同侧，世界 +Z），俯视顺时针递增
        45° = 画面右前    90° = 画面右侧    135° = 画面右后
       180° = 正后方逆光 225° = 画面左后    270° = 画面左侧   315° = 画面左前
elevation    = 地平线以上仰角（负值=底光），clamp 到 [-85, 88]
distance     = 灯到主体原点的直线距离（米）
```

球坐标 → 世界坐标：`x = d·cos(el)·sin(az)`, `y = d·sin(el)`, `z = d·cos(el)·cos(az)`，
由 `lightPosition()` 单点实现（`presets/lightingPresets.ts`），面板读数与画面灯位不会漂移。

---

## 3. 数据结构

### 3.1 新增类型

```ts
type DirectorLightRole = 'key' | 'fill' | 'rim' | 'ambient' | 'practical';
type DirectorLightType = 'directional' | 'spot' | 'point' | 'ambient';

interface DirectorLight {
  id: string; name: string;
  role: DirectorLightRole; type: DirectorLightType;
  azimuth: number; elevation: number; distance: number;   // 球坐标
  intensity: number; color: string;                        // hex
  coneAngle?: number; penumbra?: number;                   // 仅 spot
  castShadow: boolean; visible: boolean;
}
```

> 与需求列的字段相比，`DirectorLight` **多了 `type`**：渲染要求（方向光/聚光灯/点光源/环境灯分别渲染）
> 无法只靠 `role` 区分 —— 例如「轮廓光」既可能是 spot 也可能是 directional。

### 3.2 扩展点

| 结构 | 新增字段 | 兼容策略 |
| --- | --- | --- |
| `SceneSettings` | `lights: DirectorLight[]`、`ambientIntensity: number`、`exposure: number`、`lightingPresetId?: string \| null` | `DEFAULT_SCENE` 提供默认值；`createDefaultScene()` 每次返回全新灯组，避免多 project 共享引用 |
| `DirectorObject` | `builtinAssetId?: string` | 与既有 `geometryType` / `meshUrl` 并列；渲染分支顺序见 §5 |
| `Director3dShotState.environment` | `lights?`、`ambientIntensity?`、`exposure?` | 旧数据缺省时补默认两灯等价物（见 §6） |
| `Director3dSceneTemplate.environment` | `lights: DirectorLight[]`（原为 `{id,type,intensity,position}[]`）、`ambientIntensity?`、`exposure?`、`lightingPresetId?` | `coerceDirectorLights()` 读取旧模板时把 `position` 换算成球坐标 |
| `PromptDetailFlags` | `lighting: boolean`（默认 `true`） | 未传 `lightingPrompt` 的调用输出与旧版逐字节一致 |

`lightingPresetId` 从「只存不渲染的空字段」变为**真正生效**：
应用整组方案时写入方案 id；任何手动改灯（增/删/改）都会置空，标记为「自定义」。

---

## 4. 灯位与预置清单

### 4.1 24 主光位（`KEY_LIGHT_PRESETS`）

| 高度 \ 方位 | 正面 0° | 右前 45° | 右侧 90° | 右后 135° | 正后 180° | 左后 225° | 左侧 270° | 左前 315° |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 高位 55° | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 平位 15° | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 低位 -20° | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

强度随方位/高度给出真实梯度（正面 1.00 / 前侧 1.08 / 侧光 1.12 / 侧逆 0.88 / 逆光 0.78，再乘高度系数 1.05 / 1.00 / 0.85），
颜色统一为 5600K 暖白 `#fff5ea`，默认投射阴影。中文 label + 英文 prompt 片段逐格齐全。

### 4.2 9 轮廓光（`RIM_LIGHT_PRESETS`）

冷调硬轮廓（spot 30° / 1.70）、暖调柔轮廓（spot 60° / 0.95）、白热硬轮廓（directional / 2.20）、
低位逆光轮廓（spot -12° / 1.30）、侧逆冷边（directional 135° / 1.15）、霓虹青（point / 1.40）、
霓虹洋红（point / 1.35）、银幕冷白（spot 50° / 0.70）、黄昏金边（directional / 1.50）。

### 4.3 整组布光（`LIGHTING_RIG_PRESETS`）

三点布光 / 伦勃朗 / 蝴蝶光 / 黄昏逆光 / 赛博霓虹 / 审讯室 / 高调白棚 / 低调黑色电影。
每组含：灯光引用（可对单灯覆盖 role/强度/角度）、`ambientIntensity`、`exposure`、英文 `prompt`。
`resolveRigLights(rig)` 展开为完整预置；单测保证「引用数量 = 展开数量」，不会静默漏灯。

### 4.4 40 个内置模型（`BUILTIN_ASSETS`）

| 类别 | 模型 |
| --- | --- |
| 家具 | 餐桌、椅子、沙发、床、书架、柜子、书桌、吧台、地毯 |
| 建筑构件 | 门、窗、楼梯、柱子、讲台、栅栏、路灯、电线杆 |
| 自然 | 树、灌木、石头、山、原木、盆栽 |
| 载具 | 轿车、卡车、船、公交车 |
| 道具 | 木箱、木桶、长椅、话筒架、摄像机三脚架、音箱、手提箱、台灯、路锥、机柜 |
| 屏幕板面 | 电视屏、黑板、投影幕 |

每个模型 = `parts: BuiltinAssetPart[]`（几何类型 + 尺寸 + 相对位置 + 旋转 + 颜色），
原点在**落地中心**（y=0 即地面），因此放置到场景默认 transform 即贴地，无需人工抬升。

尺寸口径（`resolvePartArgs` 单点换算，渲染与单测共用）：

| geometry | size 含义 | three 参数 |
| --- | --- | --- |
| box | `[宽, 高, 深]` | `boxGeometry` |
| sphere | `[直径]` | `sphereGeometry(直径/2, 24, 16)` |
| cylinder | `[直径, 高]` | `cylinderGeometry(r, r, 高, 24)` |
| cone | `[直径, 高]` | `coneGeometry(直径/2, 高, 24)` |
| plane | `[宽, 高]` | `planeGeometry(宽, 高)`（双面材质） |

### 4.5 8 个内置场景（`BUILTIN_SCENES`）

客厅 / 卧室 / 办公室 / 教室 / 街道 / 森林 / 审讯室 / 摄影棚片场。
每个场景 = 模型摆放清单 + 背景色 + 地面透明度 + 布光方案 id + 镜头（position/target/fov）。
`applyBuiltinScene(project, scene, { idPrefix })`：

- 保留当前镜头已绑定的**角色**；
- 替换全部非角色物体为场景内容；
- 落地布光（灯组 + 环境基线 + 曝光 + `lightingPresetId`）；
- 落地镜头位/目标点/FOV 并设为活动机位；
- 清空全景背景（内置场景自带环境，不做叠加）；
- 保留工程已有 `assets`（不吞用户素材库）。

`idPrefix` 默认带时间戳，重复应用同一场景不会产生重复对象 id（单测覆盖）。

---

## 5. 渲染

`canvas/SceneContent.tsx` 的 `<LightingRig />` 按 `project.scene.lights` 渲染：

- `ambient` → `<ambientLight intensity color />`
- `directional` → `<directionalLight position color intensity castShadow />`
- `spot` → `<spotLight position color intensity angle={deg2rad(coneAngle/2)} penumbra decay={0} castShadow />`
- `point` → `<pointLight position color intensity decay={0} castShadow />`
- 全局 `ambientIntensity` 作为独立 `<ambientLight />` 叠加
- **无灯光时回退默认两灯**（老硬编码等价物），任何路径下画面都不会全黑
- `<ExposureSync />` 把 `project.scene.exposure` 写入 `gl.toneMappingExposure`

> **简化说明（有意为之）**：点光源与聚光灯使用 `decay={0}`（常量衰减）。面板上同一根 intensity 滑块
> 在方向光/点光/聚光灯下量纲一致，按预置数值布光所见即所得；真实距离平方衰减需要为每种灯准备不同的
> 强度数量级，不利于预演台快速试光。

对象渲染分支顺序（`SceneObject`）：

```
character → StageActor
mesh + meshUrl → ImportedMesh
builtinAssetId → BuiltinPropMesh（内置程序化模型）
其它 → PropMesh（基础几何体）
```

`runtime/BuiltinPropMesh.tsx` 用 `resolvePartArgs` 拼装部件，`castShadow` / `receiveShadow` 全开；
id 无法识别时渲染线框占位体块，避免出现「看不见也选不中」的幽灵对象。

---

## 6. 向后兼容（老数据不突变）

| 场景 | 行为 |
| --- | --- |
| 老 `Director3dShotState`（无 `environment.lights`） | 补 `DEFAULT_SCENE_LIGHTS`（= 老的 `directionalLight [5,10,4] intensity 0.9` 球坐标等价物：az 51.34° / el 57.40° / d 11.87m） |
| 老 shotState 无 `ambientIntensity` | 有全景 → 0.35；无全景 → 0.55（与老硬编码 `panorama ? 0.35 : 0.55` 完全一致） |
| 老 shotState 无 `exposure` | 1 |
| 老 `DirectorProject` 无 `scene.lights` | `normalizeDirectorProject` 补默认灯组（每次调用返回全新数组，不共享引用） |
| 老场景模板 `lights: {id,type,intensity,position}` | `coerceDirectorLights` 把 `position` 换算成球坐标后升级为 `DirectorLight` |
| 老模板缺 `ambientIntensity` / `exposure` | 按同一套默认规则补齐 |
| 提交/候选帧流程 | 未改动；`lightingPresetId`、`lights` 随 `environment` 一起进入 commit 快照与恢复路径 |

`StageDeckShell` 的 300ms 落盘订阅新增了 environment 同步（背景色/地面/灯组/环境基线/曝光），
使灯光改动与对象改动一样能持久化进 `Director3dShotState`；这是本轮唯一触及宿主的改动，
`Director3dHostOptions` / commit 流程 / F-045 WebGL 生命周期均未变更。

---

## 7. 提示词联动

- `buildLightingPromptFragment(lights, { ambientIntensity, exposure })` 生成英文片段，形如：

  ```
  lighting: key directional light from front-right 45° at 55° high, 3.6m, #fff5ea intensity 1.13;
  rim spot light from backlight 180° at 45° high, 4.0m, #cfe4ff intensity 1.70, 30° cone penumbra 0.15;
  ambient fill intensity 0.25
  ```

  无可见灯且无环境光时返回空串，不污染 prompt。
- `describeCameraShot` 新增 `opts.lightingPrompt`，仅在 `details.lighting` 打开且非空时插入，
  且**插在「运镜」之前** —— `skinCameraPrompt` 会裁掉 `camera movement:` 之后的内容，顺序不能颠倒。
- `addCapture`（store）、`StageDeckShell.handleCapture`、`CameraRigPanel` 预览、`CameraPresetBar` 存机位
  四处共用 `buildSceneLightingPrompt(project.scene)`，面板看到的片段与写进批出的一致。
- 未传 `lightingPrompt` 的旧调用输出与旧版逐字节一致（单测覆盖）。

---

## 8. UI 入口

| 入口 | 位置 | 内容 |
| --- | --- | --- |
| **光** | 左侧竖排抽屉（移动端 dock「灯光」） | 主光位 24 宫格、轮廓光 9 宫格、整组布光方案、环境/曝光、灯组列表（选中/删除/新增）、单灯微调、环境光预设、prompt 预览 |
| **+** | 「添加」抽屉 | 原有：体型/几何体/群演/镜头；新增：按类别分组的内置模型按钮（点击即放置到场景中心并选中） |
| **环** | 「环境与资源」抽屉 | 原有：工程导入导出/视口辅助/全景/模型导入/资源库；新增：内置场景模板（一键搭景，含布光与机位） |

灯组状态是 `project.scene` 的一部分，因此会自动进入撤销栈、工程导出、场景模板与镜头状态持久化。

---

## 9. 验收清单

### 已实现并通过验证

- [x] `KEY_LIGHT_PRESETS` 长度 24（8 方位 × 3 高度）、id 唯一、逐格中文 label + 英文 prompt
- [x] `RIM_LIGHT_PRESETS` 长度 9，覆盖硬/柔、冷/暖、高低位
- [x] `AMBIENT_PRESETS` 6 条、`LIGHTING_RIG_PRESETS` 8 组（≥6），每组引用可完整展开
- [x] `buildLightingPromptFragment` 输出方位/颜色/强度/锥角/环境基线；空灯光返回空串
- [x] 老 shotState / 老 project / 老场景模板平滑升级，默认两灯不丢场景、不共享引用
- [x] `project ↔ shotState`、`sceneTemplate ↔ project`、`applySceneTemplateToShotState` 全链路带灯
- [x] 渲染按 lights 出灯，无灯回退默认、曝光联动
- [x] `PromptDetailFlags.lighting` 默认开启，开关生效，未传片段时输出不变
- [x] `BUILTIN_ASSETS` 40 个（≥30）、id 唯一、6 类别均非空、部件数值合法且不沉入地面
- [x] `BUILTIN_SCENES` 8 个（≥6），引用的模型全部存在
- [x] `applyBuiltinScene` 保留角色、落地模型/布光/机位、重复应用无 id 冲突
- [x] 内置对象数据经 `JSON` 往返后仍能还原并组装渲染参数
- [x] store 动作：放置内置模型、应用整组布光、单灯预置、增删改灯、环境/曝光
- [x] 既有回归：`director3d-state`、`stage-composer-camera` 全绿（见 §11 证据）

### 本轮未实现（明确的边界）

- **视口内拖拽灯位**：需求标注为可选加分项，本轮只做面板滑块精确控制；视口内也没有灯光图标/gizmo。
- **色温以 K 值调**：用 hex 颜色表达，未提供开尔文数值输入与黑体色换算。
- **阴影质量参数**：未开放 shadow map 分辨率、bias、软阴影半径；沿用 Canvas 级 `shadows` 开关与性能模式降级。
- **IES / 光域网、体积光、镜头光晕**：未实现。
- **内置模型无贴图/UV**：纯 `meshStandardMaterial` 单色部件，不能导出为 glb。
- **灯组排序、分组**：列表按创建顺序展示，仅支持改名/启停/删除。
- **灯光不单独写入 `director3dGuide`**：灯光只通过 `cameraPrompt`（含 `lighting:` 片段）与 shotState 快照体现。
- **`importSceneTemplateJson` 未做强校验**：沿用既有宽容读取 + `coerceDirectorLights` 升级。

---

## 10. 依赖与代码落点

未新增任何三方依赖（仅用既有 three / @react-three/fiber / drei / three-stdlib / zustand）。

| 文件 | 作用 |
| --- | --- |
| `packages/director3d/src/presets/lightingPresets.ts` | 24+9+6 预置、8 组布光、球坐标换算、prompt 片段 |
| `packages/director3d/src/presets/builtinAssets.ts` | 40 个程序化模型规格、类别、几何参数换算 |
| `packages/director3d/src/presets/builtinScenes.ts` | 8 个内置场景、`applyBuiltinScene` |
| `packages/director3d/src/runtime/BuiltinPropMesh.tsx` | 内置模型渲染 |
| `packages/director3d/src/panels/LightingPanel.tsx` | 灯光抽屉面板 |
| `packages/director3d/src/schema/directorProject.ts` | 数据模型与全部兼容升级路径 |
| `packages/director3d/src/canvas/SceneContent.tsx` | 灯光渲染、曝光同步、内置模型分支 |
| `packages/director3d/src/store/directorStore.ts` | 灯光与内置模型的 store 动作 |
| `apps/web/src/engine/__tests__/director3d-lighting.test.ts` | 15 条灯光单测 |
| `apps/web/src/engine/__tests__/director3d-builtin-assets.test.ts` | 12 条内置资产单测 |

---

## 11. 验证与仓库阻塞（重要）

### 已验证（本轮实跑）

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @nx9/director3d typecheck` | **仅剩 5 条既有报错**（`sculpt/*` 的 implicit any），与改动前的干净工作树**逐条一致**，无新增 |
| `pnpm --filter @nx9/web typecheck` | 76 条报错，与改动前干净工作树的 `文件:行:列` 集合**完全相同**（diff 为空），无新增 |
| 新增 2 个测试文件 | 27 条全部通过（灯光 15 + 内置资产 12） |
| `director3d-state` / `stage-composer-camera` 回归 | 6 + 16 条全部通过 |
| 四套件合并复跑 | `Test Files 4 passed (4)` / `Tests 49 passed (49)`，exit 0 |

> 上面两条 typecheck 的对比是在「共享包能解析」的前提下做的：本工作树的 `node_modules` 原本为空，
> 已执行 `pnpm install --frozen-lockfile`（锁文件未变更）；由于共享包构建失败但 `tsc` 仍会 emit，
> 期间存在过一份半成品 `packages/shared/dist`，验证结束后已删除，避免 `scripts/ensure-shared-dist.mjs`
> 误判「共享包已就绪」。

### 阻塞：本仓库当前工作树缺少共享包数据文件

`pnpm --filter @nx9/shared build` 与依赖它的官方 vitest 命令在当前工作树**无法完成**，原因与本次改动无关：

- `.gitignore` 第 12 行的 `data/` 规则会匹配**任意层级**的 `data` 目录，把 `packages/shared/src/data/` 也一起忽略；
- 因此下列 9 个被 `packages/shared/src/index.ts` re-export 的模块**从未进入 git**，本工作树（克隆）里也不存在：

  `camera-presets`、`character-face-rig-presets`、`creative-asset-presets`、`emotion-presets`、
  `playbook-definitions`、`provider-registry`、`shot-lexicon-taxonomy`、`shot-library-seeds`、`shot-move-families`

- 后果：`@nx9/shared` 编译失败；vitest 把 `@nx9/shared` 别名指向 `packages/shared/src/index.ts`，
  于是**任何**导入共享包的测试（含改动前就已存在的用例）都无法加载，属于既有缺陷。

证据与处置建议：

```
$ git check-ignore -v packages/shared/src/data/emotion-presets.ts
.gitignore:12:data/    packages/shared/src/data/emotion-presets.ts

$ pnpm --filter @nx9/shared build   # exit 1
src/utils/creative-asset-prompts.ts(26,90): error TS2307: Cannot find module '../data/creative-asset-presets' ...
```

1. 建议把 `.gitignore` 的 `data/` 改为 `/data/`（只忽略仓库根的本地数据目录），否则以后新增的 shared 数据文件仍会静默丢失；
2. 在这台机器上的完整工作副本里补齐上述 9 个 `packages/shared/src/data/*.ts` 后，官方 5 步验收命令即可全部跑通；
   `packages/shared/src/data/shot-library-seeds.ts` 可由 `node scripts/promote-shot-library-seeds.mjs`
   从已提交的 `docs/nx9-shot-seeds-neutral.json` 重新生成，其余 8 个需从完整副本恢复。

为了在不改动仓库的前提下验证本轮代码，测试是用**临时配置**（`@nx9/shared` 指向桩文件，桩文件放在系统临时目录）
额外跑通的，配置与桩文件均已删除；`director3d-node.test.ts` 因依赖共享包的 `BLOCK_CATALOG` 等真实导出，
桩模式下无法加载（`TypeError: Cannot read properties of undefined (reading 'map')` @ `src/blocks/registry.tsx:90`），
与本次改动无关。

### 另一项未验证项

- **浏览器实跑**：本工作树的 Web 端因同一个共享包缺陷无法启动（Vite 别名指向 `packages/shared/src/index.ts`），
  因此灯光的实际画面效果、内置模型的观感、曝光滑块的手感没有做浏览器实测；
  灯光渲染分支与内置模型拼装只经过类型检查 + 数据结构单测。
  恢复共享包数据文件后，请用 `pnpm dev` 打开 3D 导演台，按 §9 的验收清单逐条目视确认。

