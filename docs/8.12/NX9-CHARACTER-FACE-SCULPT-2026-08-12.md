# NX9 角色捏模台 · 设计整理与未闭环台账

> **日期**：2026-08-12  
> **存放**：`docs/8.12/`（本轮整理专档）  
> **原档**：`docs/NX9-CHARACTER-FACE-SCULPT-DESIGN.md` 已改为跳转 stub  
> **范围**：素材库角色 Tab · `creative.faceRig` · `@nx9/director3d` sculpt · 出图锁身份  
> **原则**：以代码可证伪为准；P1 代理丑 ≠ bug；终局是正式身份 GLB + 定妆截图，不是表情播放器

---

## 0. 怎么读本文

| 节 | 用途 |
|----|------|
| §1 | 一句话结论与阶段总表 |
| §2 | 已闭环（P0/P1 代码锚点） |
| §3 | **未闭环清单**（缺口 / 文档漂移 / 诚实边界） |
| §4 | 产品与架构（精简保留） |
| §5 | 基模契约 + 美术最短交付 |
| §6 | P2→P4 开工顺序 |
| §7 | 文件地图 |
| §8 | 明确不做 |

---

## 1. 一句话结论

**捏模台 = 对着 NX9 自有头身基模改结构旋钮，网格实时变形；`faceRig` 是唯一参数源；截图进定妆，文本进 Prompt。产品目标是 45 项身份骨相，不是 ARKit 表情播放器。**

P1 已用 **代理粘土人 + 6 个高信号项**打穿「数 → 网格」。视口里的球头胶囊身是**故意占位**，不是成品。

| 阶段 | 目标 | 状态 |
|------|------|------|
| **P0** | `faceRig` 字典 / 读写 / Prompt 编译 / 左栏滑块 | ✅ |
| **P1** | 代理网格 + 切片 6 项真变形 + 全屏捏模台 | ✅ |
| **P2** | 控制点拖拽 / 对称解锁 / 机位键 / 台内 undo | ❌ |
| **P3** | 规范机位离屏截图 → `faceLockUrl` + 健康条 | ❌ |
| **P4** | 正式 `nx9-character-base.glb` + 铺 morph + 材质 | ❌ |

三步价值：

```
faceRig（SSOT，-100~+100）
  ├─ applyFaceRigToObject()  → 视口网格     ✅ P1（切片 6 项）
  ├─ buildFaceRigPrompt()    → 出图文本锁   ✅ P0
  └─ captureCanonicalViews() → faceLockUrl  ❌ P3
```

硬规则：

1. **字典 / 驱动器 / 契约按 45 项写**；缺 morph 静默跳过，继续只进 Prompt。  
2. **P1 视口必须肉眼可见变形的只有 6 项**（§4.3 切片）；其余可改数、可编译、网格可不动。  
3. **不要等正式 GLB**；代理先跑通，美术按 §5 并行做模，P4 替换。  
4. **身份先于表情**；表情继续用 `creative.expressions` 图槽，禁止塞进 `faceRig`。  
5. **库里不存变形 glTF**；只存参数 + 截图，需要网格时基模 + `faceRig` 当场解算。

---

## 2. 已闭环（可对照代码）

### 2.1 P0 · 参数骨架

| 能力 | 锚点 |
|------|------|
| `CharacterFaceRig` 类型 | `packages/shared/src/types/creative-asset-center.ts` |
| 45 项字典 + `driver` | `packages/shared/src/data/character-face-rig-presets.ts` |
| 读写 / 编译 / hash | `packages/shared/src/utils/character-face-rig.ts` |
| Bible / 设定板 Prompt 注入 | `creative-asset-prompts.ts` / `character-sheet-master.ts` |
| 左栏 `#char-face` 滑块 | `CharacterFaceRigSection.tsx` |
| 单测 | `apps/web/src/engine/__tests__/character-face-rig.test.ts` |

### 2.2 P1 · 瘦身视口

| 能力 | 锚点 | 备注 |
|------|------|------|
| `P1_VIEWPORT_PARAM_IDS` | `sculpt-contract.ts` | `faceLength` / `jawWidth` / `eyeSpacing` / `noseBridgeHeight` / `shoulderWidth` / `heightFeel` |
| `applyFaceRigToObject` | `apply-face-rig.ts` | morph + bone；`material`/`prompt` 跳过 |
| 代理头（4 对 morph） | `procedural-head.ts` | 球+锥，非成品脸 |
| 代理身（Root / Clavicle） | `procedural-body.ts` | 胶囊分段组 |
| 命令式 Scene（事件驱动） | `CharacterSculptScene.ts` | 无空闲 RAF；**只加载 proxy** |
| React 薄壳 | `CharacterSculptViewport.tsx` | mount / resize / setState |
| 全屏台 | `FaceSculptModal.tsx` | 切片 6 滑块 + 展开 45 + 中性对照 |
| 入口 | `CharacterFaceRigSection`「打开捏模台」 | |
| 单测 | `character-sculpt-p1.test.ts` | 契约切片 / influence / bone / 缺 morph 不抛 |

**P1 验收口诀（已满足设计意图）：**

1. 拖切片 6 项 → 对应区域可见变形。  
2. 拖未接入项（如 `upperLipThickness`）→ Prompt 有文案，网格可不动。  
3. 中性对照按住回基模，松开恢复 draft。  
4. 松手 `onCommit` 写库；拖中只改 liveRig。  
5. 无正式 GLB 也能开发与单测。

---

## 3. 未闭环清单（本文核心）

判定：❌ 断点 / ⚠ 半闭环或文档漂移 / ⏸ 产品后置须记档 / ✅ 已绿勿再开。

### 3.1 产品阶段缺口

| ID | 判定 | 缺口 | 影响 | 收口阶段 |
|----|------|------|------|----------|
| FACE-01 | ❌ | 视口永远是代理粘土人；无 GLB 加载器接入 Scene | 用户以为「3D 捏脸坏了/太丑」 | P4（可先做 DEV 加载 custom 调试口） |
| FACE-02 | ❌ | 无 `Handle.*` 拾取与轴向拖拽 | 不像游戏捏人，只能拧滑块 | P2 |
| FACE-03 | ❌ | 对称锁 UI / `asymmetric` 左右扩展键未驱动网格 | 解锁不对称无真左右差 | P2 |
| FACE-04 | ❌ | 台内 undo / 机位快捷键（F/S/Q/B） | 误拧难回；构图靠手转 | P2 |
| FACE-05 | ❌ | `exportImage` + 规范机位写 `faceLockUrl` | 捏完不能锁生图身份 | P3（对出图价值最大） |
| FACE-06 | ❌ | 健康条 `face-rig-not-rendered` / `face-rig-metric-conflict` / `face-rig-mesh-stale` | 参数改了无提示重截 | P3 |
| FACE-07 | ❌ | `nx9-character-base.glb` + manifest + LICENSE | 无成品身份基模 | P4 + 美术并行 |
| FACE-08 | ❌ | `driver: material`（虹膜/眉/肤/雀斑）运行时未写 | 字典有类型，视口无效果 | P4 |
| FACE-09 | ⏸ | 导演台 `StageActor` 仍球头胶囊；未桥接 `faceRig.body` | 舞台比例 ≠ 捏模比例 | P4 可选 |
| FACE-10 | ⏸ | 3D 表情 / 发型服装 / 照片拟合 | 身份未锁前做了会变成「同一张脸演戏」 | P3 后另开 |

### 3.2 文档 ↔ 代码漂移（整理时发现）

| ID | 判定 | 文档曾写 | 代码现状 | 收口 |
|----|------|----------|----------|------|
| DRIFT-01 | ⚠ | `meshContractVersion` 进 `CharacterFaceRig` | **类型里没有该字段** | P3 加字段或改文档删掉 |
| DRIFT-02 | ⚠ | `exportImage` / 正交相机 / 四灯预设模块 | Scene 只有预览渲染；无 `sculpt-cameras.ts` / `sculpt-lights.ts` / `sculpt-handles.ts` | 按阶段补文件，勿假装已有 |
| DRIFT-03 | ⚠ | `applyFaceRig` 写 iris / material | **显式 `continue` 跳过 material** | 诚实：P1 不做；P4 再接 |
| DRIFT-04 | ⚠ | 加载 GLB + `loadToken` + `SkeletonUtils.clone` | Scene **硬编码** `createProxyCharacter()` | P4 加载路径 |
| DRIFT-05 | ⚠ | 关闭时「已锁角色须新建版本」 | Modal 无锁角色守卫 | 接现有 consistency.locked 流程 |
| DRIFT-06 | ⚠ | 左窄条头/身/灯光/输出 | UI 只有视口 + 右栏滑块 | P2/P3 再铺 |
| DRIFT-07 | ⚠ | 兼容徽章点开 missing 列表 | 仅顶栏 `视口切片 n/6` tip | P2 可补抽屉 |
| DRIFT-08 | ⚠ | 代理「分段全身骨」叙述偏满 | 代理身只有 Root + Clavicle + 胶囊臂 | 本文 §5 已按代码收紧 |

### 3.3 诚实边界（对外 / 对内）

| ID | 判定 | 说明 |
|----|------|------|
| HONEST-01 | ⚠ | 捏模台文案已写「P1 切片」，但代理模无醒目标签「工程占位，非成品基模」→ 易被当成 bug |
| HONEST-02 | ⚠ | 展开 45 项里非切片标「仅 Prompt」✅；勿对外说「已支持完整 3D 捏 45 项」 |
| HONEST-03 | ⏸ | DEEP-13 定性「非主链阻断」仍成立；但若宣传「真 3D 捏脸」必须按阶段诚实 |

### 3.4 闭环判定（一眼）

| 链路 | 闭环？ |
|------|--------|
| 改滑块 → `faceRig` 落库 → 刷新复现 | ✅ |
| `faceRig` → Prompt → Bible/设定板 | ✅ |
| `faceRig` → 视口网格（切片 6） | ✅（代理） |
| `faceRig` → 视口网格（其余 39） | ❌（等 morph/骨） |
| 控制点拖 → 同一份 `faceRig` | ❌ |
| 捏完 → 规范截图 → `faceLockUrl` → 生图 ID LOCK | ❌ |
| 正式好看基模 → 同一驱动器 | ❌（无 GLB） |
| 捏模比例 → 导演台人偶 | ❌ |

**最大未闭环（产品）**：FACE-05 定妆写出图 + FACE-07 正式基模。  
**最大未闭环（体感）**：FACE-01 代理丑 + FACE-02 无拖点。

---

## 4. 产品与架构（精简）

### 4.1 选型（不变）

| 选 | 弃 |
|----|----|
| glTF morph（脸）+ 骨 scale（身比例） | 自由笔刷、脸骨肌肉网、2D warp 主预览 |
| vanilla `CharacterSculptScene` 事件渲染 | 为捏模再开 R3F Canvas / 空闲 RAF |
| `faceRig` 唯一 SSOT | 存顶点缓存 / 变形 glb 进库 |
| 身份 morph 名 `jawWidth.pos` | ARKit `jawOpen` 当捏脸 |

切片 6 项**不要**与左栏 `quick: true` 混名单（左栏是 Prompt 摘要脸项；切片含肩宽/身高感以跑通身骨）。

### 4.2 运行时边界

| 场景 | 用哪套人 |
|------|----------|
| 素材库捏模台 | sculpt 代理 / 将来正式 GLB |
| 导演台摆镜头 | 继续 `StageActor` 胶囊（P4 前不换） |
| 无 WebGL | 不进台，退回左栏滑块 |

### 4.3 强度映射（已实现）

```
u = clamp(v / 100, -1, 1)
morph.pos = max(0, u) ; morph.neg = max(0, -u)
bone.scale = 1 + u * k   // k 在 sculpt-contract BONE_DRIVERS
```

Prompt 侧 `|v|<20` 死区**只作用于编译**；视口从 ±1 就要动。

---

## 5. 基模契约与美术最短交付

生产资产目标路径：

```
packages/director3d/assets/nx9-character-base.glb
packages/director3d/assets/asset-manifest.json
packages/director3d/assets/LICENSE-*.txt
```

契约版本：`NX9_SCULPT_MESH_CONTRACT = 1`。

### 5.1 命名（必须逐字）

```
CharacterRoot
  Armature
    Root → Hips → Spine → Chest → Neck → Head
         → Clavicle.L/R → … → Hand.L/R
         → UpperLeg.L/R → … → Foot.L/R
  HeadMesh    // morph targets
  BodyMesh    // skinned；bodyFat / muscleMass
  Handle.*    // 空物体，P2 控制点
```

Morph：`{paramId}.pos` / `.neg`（可再拆 `.L` / `.R`）。  
禁止 Mixamo 前缀进生产模；禁止只有 smile/blink/jawOpen 的表情头冒充身份基模。

`builtin`/`custom`：身份 morph 映射 < 12 → 判定表情头，强制回退 proxy。  
`proxy`：豁免 12 项门槛，但必须覆盖切片 6 项。

### 5.2 面数与外观

- Head 8k–20k tri；Body 8k–25k；合计远低于 10 万警告。  
- 默认 clay `#C8C4BE`；shaded + 肤色 tint 属 P4。

### 5.3 美术并行：最短第一包（不必等 45）

先交付能替换代理、跑绿校验的 **MVP GLB**：

| 优先级 | 内容 |
|--------|------|
| 必须 | 中性灰泥头+身；节点名对齐 §5.1 |
| 必须 | 切片 4 个脸 morph 正负：`faceLength` / `jawWidth` / `eyeSpacing` / `noseBridgeHeight` |
| 必须 | 骨：`Root`、`Clavicle.L`、`Clavicle.R`（身高/肩宽） |
| 建议 | 再补 ≥8 个身份 morph，凑够「≥12」门槛，避免被当表情头踢回 |
| 建议 | `Handle.Hairline` / `Jaw.L/R` / `EyeOuter.L/R` / `NoseBridge` / `Shoulder.L/R`（给 P2） |
| 后置 | 其余 39 项 morph、材质、shaded 贴图 |

**不要**从网上直接丢一个好看角色进仓：骨骼名与身份 morph 对不上会继续回退代理。正确路径是 Blender 按契约改名 + 做 shape keys，或自研基模。

来源策略：

| 来源 | 可用性 |
|------|--------|
| 自研 Blender 身份基模 | ✅ 正路 |
| 可商用底座 → DCC 重命名 + 补身份 morph | ⚠ 可用，须过校验与 LICENSE |
| 任意漂亮人 / 仅 ARKit 头 | ❌ |

---

## 6. 下一阶段开工顺序（锁死）

禁止插队：网格不动不做拖点；无真变形不做定妆冒充；正式 GLB 不是 P2 开工条件。

### 6.1 P2 · 控制点

- 新增 `sculpt-handles.ts`：切片对应 Handle 拾取 + 轴向拖  
- 对称默认开；`asymmetric` + `.L/.R` 扩展键  
- 机位键；台内 undo（只记 faceRig，≤50）  
- 验收：拖右下颌左镜像；解锁单侧；拖 10s 不写库、不掉帧；Ctrl+Z 回拖前  

### 6.2 P3 · 定妆（出图价值最大）

- `exportImage`：独立 Renderer、固定像素、规范机位；**禁止**预览 canvas 拉伸  
- 默认写 `faceLockUrl`；可选多视图  
- `renderedAt`（已有类型）+ 可选补 `meshContractVersion`  
- 健康条三项；上传走现有媒体通道  
- 验收：写出妆后详情头像变；改窗再导出像素仍固定；改参后健康条亮、再截灭  

### 6.3 P4 · 正式模

- 加载 builtin GLB；同一 `applyFaceRigToObject`  
- 身份覆盖率校验启用；material 驱动；clay/shaded  
- 可选舞台身段缩放  
- 代理保留为 CI / 无资产回退  

### 6.4 建议立刻做的文档外小修补（非阶段大刀）

1. 捏模台顶栏或视口角标：**「工程代理 · 非成品基模」**（消 HONEST-01）。  
2. 深挖台账锚点改指本文（见文末）。  

---

## 7. 文件地图

| 路径 | 阶段 | 状态 |
|------|------|------|
| `shared/.../character-face-rig-presets.ts` | P0 | ✅ + driver |
| `shared/.../character-face-rig.ts` | P0 | ✅ |
| `director3d/src/sculpt/sculpt-contract.ts` | P1 | ✅ |
| `director3d/src/sculpt/morph-alias.ts` | P1 | ✅ |
| `director3d/src/sculpt/apply-face-rig.ts` | P1 | ✅（无 material） |
| `director3d/src/sculpt/procedural-*.ts` | P1 | ✅ |
| `director3d/src/sculpt/CharacterSculptScene.ts` | P1 | ✅ proxy only |
| `director3d/src/sculpt/CharacterSculptViewport.tsx` | P1 | ✅ |
| `director3d/src/sculpt/sculpt-handles.ts` | P2 | ❌ 未建 |
| `director3d/src/sculpt/sculpt-cameras.ts` | P3 | ❌ 未建 |
| `director3d/src/sculpt/sculpt-lights.ts` | P1+/P3 | ❌ 未建（灯写死在 Scene） |
| `director3d/assets/nx9-character-base.glb` | P4 | ❌ |
| `apps/web/.../face-sculpt/FaceSculptModal.tsx` | P1 | ✅ |
| `apps/web/.../asset-library-health.ts` 捏模项 | P3 | ❌ 未挂 |

---

## 8. 明确不做

| 项 | 理由 |
|----|------|
| 自由顶点笔刷 / 拓扑编辑 | 破坏 SSOT |
| 第二套 3D 引擎 | 已有 three |
| ARKit 52 路当捏脸 | 捏不出第二个人 |
| 表情头冒充身份基模 | 覆盖率校验挡住 |
| P1 为 45 项造空 morph | 误报已映射 |
| 等 GLB 才开工程 | 等模=停工 |
| 预览 canvas 当定妆 | 分辨率不可复现 |
| 空闲 RAF | 模态空转 GPU |
| 制作台/导演台平行捏脸 UI | 唯一编辑面=素材库 |
| 捏模台做成画布节点 | 角色编辑不在节点图 |
| 变形网格进公共库 | 公共只读 |
| 2D warp 写 `faceLockUrl` | 污染 ID LOCK |

---

## 9. 关联台账

| 文档 | 关系 |
|------|------|
| `docs/8.12/NX9-DEEP-OPEN-LOOPS-2026-08-12.md` DEEP-13 | 捏模半成品总览 → 细节以**本文**为准 |
| `docs/8.12/NX9-DEEP-REMAINING-GAPS-2026-08-12.md` | 深挖残留里的捏脸项 |
| `docs/NX9-ASSET-LIBRARY-OPEN-LOOPS.md` | 素材库其它闭环；捏模细节不重复铺开 |
| `docs/NX9-CHARACTER-FACE-SCULPT-DESIGN.md` | stub → 本文 |

---

## 10. 一句话产品定义

**在素材库里拧身份旋钮，网格当场变；参数进档案，截图进定妆，文本进 Prompt。P1 已打穿「6 项 → 代理网格」；未闭环的是拖点手感、定妆出图锁、以及一份真正好看的身份 GLB。**
