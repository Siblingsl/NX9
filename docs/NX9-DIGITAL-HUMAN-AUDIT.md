# NX9 — 数字人 / 演员库链路缺口核实与补缺

- 核实时间：2026-09-16
- 核实方式：全部用 `node` 直读源码（不靠 grep 下结论）
- 结论口径：**已存在 / 半成品 / 缺失**，每条附 `文件:行` 证据
- 本轮只补**真缺**项；既有能力一律不动

---

## 0. 结论先行（这张表是核心）

| # | 能力 | 结论 | 关键证据 |
|---|---|---|---|
| 1 | 文本 → 角色形象生成（提示词生成"演员"外形） | **已存在**（主链路）＋**半成品**（F-037 轻量路径孤儿） | `buildCharacterSheetGenerationPrompt` 吃 `descriptionZh`/`bible.appearance`/捏脸参数；UI 在素材库角色详情「主生成 · 设定板」。但 `use-bible-image-gen.ts` 的 `useBibleImageGen` **零 UI 调用方** |
| 2 | 角色一致性锁定（一致性短语／参考图注入下游出图·出视频） | **已存在**，且很完整 | `character-prompt.ts:60/82/93` + 出图执行器 `picture-gen-executor.ts:167,397` + 视频 `clip-gen-ops.ts:233,252` + 镜头资产 `shot-asset-enrich.ts:158` |
| 3 | 多角色同框（绑定与区分） | **半成品** | 绑定/区分在 **Prompt 层已完备**（逐角色成块 + 逐角色换装 + 3D 走位）；但**参考图注入是单槽** —— `pickReferenceImage` 只取第一位有图角色，`resolvePictureSendRefs` 只收一个 `characterRef`（`picture-gen-refs.ts:126,143,163`） |
| 4 | 声线 ↔ 角色绑定与配音联动 | **半成品**（真缺一环） | 参考音链路完整（`resolveCharacterReferenceAudio` + 发布到声音库 + `VoiceCast` 的 `char:<id>`）；但 **`CharacterProfile.voiceProfileId`（声线档案=引擎 voiceId）全仓无写入口、配音侧无读取**——`sound-gen-runner.ts:113` 缺省直接落 `alloy` |
| 5 | 角色库查看 / 管理 / 复用入口 | **已存在**（很完整） | 卡片网格 + 编辑 + @提及复制 + 锁定 + 导入内置 + 复制到项目 + 发布公共 + 删除 + 版本 + 健康条 + 捏脸 + 服装绑定 |
| 6 | 角色一致性**体检** | **已存在（两套互补）** | ①结构性：`asset-library-health.ts` 角色维度 11 项指标；②图像级跨格：`consistency-check.ts` + `consistency-report.ts`，已接 `CharacterSheetWorkspace`（角色维度）与 `MultiGridWorkspace`；③分镜预览另有 `character` 维度评分（`storyboard-preview-runner.ts:231,285`） |

**本轮补了什么**：只补 **#4 的声线档案绑定闭环** 与 **#3 的参考图覆盖不可见**（只读诊断，不改既有单槽行为）。
**明确没做**：#1 的孤儿 hook 未接线（理由见 §3）；#3 的多槽注入未改（理由见 §3）。

---

## 1. 逐项现状（含证据）

### 1.1 文本 → 角色形象生成

**主链路：已存在。**

- 提示词装配：`packages/shared/src/utils/creative-asset-prompts.ts`
  - `buildCharacterBiblePrompt`（:101）吃 `descriptionZh`、`bible.{identity,appearance,personality,background,voice,relationships}`、捏脸参数、服装；
  - `buildCharacterSheetGenerationPrompt`（:154）其中
    `characterDescription = c.descriptionZh || c.consistencyPrompt || appearance`，
    `appearanceLock = lines(buildCharacterFaceRigPrompt(c), bible.appearance || specialMarks || consistencyPrompt)`。
- UI 入口：`apps/web/src/panels/asset-library/modal/AssetDetailCharacterView.tsx:71`（顶栏「完整设定板 / 五类原图」）
  → `use-asset-library-generation.ts:457 generateCharacterMasterSheet` / `:511 generateCharacterCategorySheets`
  → 写回 `referenceImageUrl`＋`creative.fullSheetUrl`＋裁切回填五类原图。
- 另有 3D 捏脸定妆：`panels/asset-library/CharacterFaceRigSection.tsx`（`faceLockUrl`）。

**结论：能力存在，不是缺口。** 从「一段中文描述」到「演员外形图」的链路是通的。

**半成品：F-037 轻量路径是孤儿。**
- `packages/shared/src/utils/asset-bible-image.ts:34 buildBibleImagePrompt`（`kind: 'character' | 'scene'`，单图定妆）+ `apps/web/src/engine/use-bible-image-gen.ts:11 useBibleImageGen`。
- 全仓 `useBibleImageGen` 的引用**只有测试自己**（`apps/server/test/f037-acceptance.test.ts:105,128`、
  `apps/web/src/engine/__tests__/manifest-bible-task-honesty.test.ts:27` 都是**断源码字符串**，不是运行时调用）；
  `apps/web/src` 内**零 import**。
- 附带缺陷：`asset-bible-image.ts:60 buildBibleImagePatch` 产出 `{ referenceImageUrl, referencePrompt }`，
  而 `referencePrompt` **不是 `CharacterProfile` 的字段**（`packages/shared/src/types/character.ts:16-44` 无此字段）。

### 1.2 角色一致性锁定

**已存在，且覆盖出图与出视频两条下游。**

- 核心（`packages/shared/src/utils/character-prompt.ts`）：
  - `resolveBlockCharacters`（:34）：`data.characterId` ＋ `shot.characterIds` ＋ `shot.characterNames` 三路并集，
    含姓名回退解析（剧本拆分场景）；
  - `characterPromptSuffix`（:60）：逐角色成块 `[Character 名]: <desc>\nCostume lock: <costume>`，
    末尾统一 `keep face structure, hairline, body proportion, costume landmarks identical; no wardrobe drift; no identity drift`；
    desc 优先级：`creative.prompts.bible.text` → `consistencyPrompt` → `descriptionZh`；
  - `enrichPromptWithCharacters`（:82）纯追加；
  - `pickReferenceImage`（:93）：`referenceImageUrl` → `creative.fullSheetUrl` → `creative.frontViewUrl` → 上游首图。
- 下游接线：
  - 出图：`apps/web/src/engine/executors/picture-gen-executor.ts:167,168,397`
    （还合并 `@角色` 提及，:168-172）；
  - 出视频：`apps/web/src/engine/flow-runner-ops/clip-gen-ops.ts:233,252,377,502,621`；
  - 镜头服装/道具/镜头词典：`packages/shared/src/utils/shot-asset-enrich.ts:149-171`；
  - 工作室提示词：`packages/shared/src/utils/studio-prompt-builder.ts:115,161,193`。
- 锁定/版本：`CharacterProfile.creative.consistency.lockedPromptSnapshot`（`AssetDetailCharacterView.tsx:47-63` 新建版本时锁 Prompt），
  镜表钉 `characterRevisionPins` / `usedAssetIds` 的 `id@rev`（`packages/shared/src/types/character.ts:27-33` 注释）。

**结论：完备，无缺口。**

### 1.3 多角色同框

**半成品。**

已存在的部分（绑定与"区分"）：
- 绑定：镜级 `characterIds` / `characterNames` 数组；`shot-edit-modal.tsx:757-772` 角色预选 chips 可多选；
- 区分（Prompt 层）：`characterPromptSuffix` 逐角色成块并带名字前缀；
- 区分（换装）：`shot.costumeOverrides` 逐角色换装（`shot-edit-modal.tsx:497-536`；
  `shot-asset-enrich.ts:97 applyShotCostumeOverridesToCharacters`）；
- 区分（空间，仅 3D）：`buildDirectorCharacterPlacementPrompt`（`packages/shared/src/utils/storyboard-preview-jobs.ts:14`）
  输出 `name at (x,y,z), yaw …, pose …`，仅在 `shot.director3dGuide.characterPlacements` 存在时生效。

**真缺（半成品那一半）**：**参考图注入只有单槽。**
- `pickReferenceImage` 遍历后 `return url`（`character-prompt.ts:97-104`）→ 只返回**第一位**有图角色；
- `buildCharacterContext` 因此只产出**一个** `referenceImageUrl`（:107-120）；
- 出图执行器把它当**单个** `characterRef` 传入（`picture-gen-executor.ts:278,286`）；
- `resolvePictureSendRefs` 的入参就是 `characterRef?: string | null`（`picture-gen-refs.ts:126`），
  注入也只 push 一条（:162-164）。
- 出图工作区 UI 同样只反映这一条：`PictureWorkspace.tsx:948 characterRef: charCtx.referenceImageUrl`。

⇒ 一个镜头挂 3 个角色时，**只有第 1 个角色的定妆图进生成请求**，其余仅靠 Prompt 文字。
在此之前**界面完全看不出来**，用户会以为「都锁了」。
（视频侧以关键帧为图源，一致性靠 Prompt + 关键帧，影响较小：`clip-gen-ops.ts:256 imageUrl = item.imageUrl`。）

### 1.4 声线 ↔ 角色绑定与配音联动

**半成品：参考音那一半完整，声线档案那一半断链。**

完整的部分：
- 角色参考音解析有权威单点：`packages/shared/src/types/sound-library.ts:226 resolveCharacterReferenceAudio`
  （优先 `soundAssetId` → 声音库 `audioUrl`，回退 `referenceAudioUrl`）；
- 发布闭环：角色详情「发布到声音库」写 `soundAssetId`（`AssetDetailCharacterView.tsx:137-152`）；
- 单轨配音选角色：`blocks/core/SoundGenBlock.tsx:521-543`（选角色 → 写节点 `characterId` / `referenceAudioUrl` / `soundAssetId`）；
- 多角色配音映射：`blocks/nx9/VoiceCastBlock.tsx:30,142-176`（`profileMap`：speaker → 引擎 `voiceId` 或 `char:<id>`），
  跑完写回 `voice.lines` 带 `shotId`（:85-118），供剪辑台 `buildVoiceDramaTimeline` 挂轨；
- 录制台批量合成：`pages/studio/useStudioDesk.ts:750-783`。

**断链处（真缺）**：
- `CharacterProfile.voiceProfileId`（`packages/shared/src/types/character.ts:25`）语义在服务端是明确的
  ——**声线档案 id**：`apps/server/src/modules/workspace/voice-workspace.service.ts:57`
  `payload.characters?.characters.find((c) => c.voiceProfileId === profile?.id)`；
- 但**全仓没有任何 UI 写它**。全仓 `voiceProfileId` 出现 10 处，逐一核对后：
  - 类型声明 1（character.ts:25）、`VoiceLine.voiceProfileId` 是**另一个字段**（storyboard.ts:262）；
  - 写入点只有两处，且都不是「角色 → 声线档案」：
    `engine/script-breakdown-runner.ts:61`（置 `null`）、
    `pages/studio/useStudioDesk.ts:770`（把 **char.id** 写进 **VoiceLine**.voiceProfileId）；
  - 读取点：服务端上述 :57，以及 `useStudioDesk.ts:754`；
  - 文档：`docs/NX9-ASSET-LIBRARY-CHARACTER-ANALYSIS.md:35,378`、`docs/NX9-ASSET-LIBRARY-GAP-SPEC.md:20,124,205(Snd-02)`
    都已指出「与 `voice.profiles` 三角未产品化」。
- 配音侧因此也无从下沉：`engine/sound-gen-runner.ts:113`
  `const mapped = profileMap[line.speaker] ?? 'alloy';` —— 角色绑了声线档案也不会被用上，缺省落 `alloy`。

⇒ 角色详情能上传/发布**参考音**（克隆源），却**没有任何地方能声明"这个角色用哪个引擎音色"**，
每次配音都要在节点里手选，或吃 `alloy`。

### 1.5 角色库查看 / 管理 / 复用入口

**已存在，覆盖充分。** 证据：

- 列表/卡片：`panels/asset-library/CharacterCardGrid.tsx`（封面回退 `resolveCharacterCardImage` :6、锁定态 :16）；
- 更多菜单：`CharacterCardGrid.tsx:262-286`（编辑 / 复制 @提及 / 锁定·解锁 / 导入到当前库 / 复制到项目 / 发布到公共 / 删除）；
- 详情：`modal/AssetDetailCharacterView.tsx`（顶栏版本、锁定、主生成、发布公共、删除、跳转、导航栈）；
- 字段编辑：`AssetDetailFields.tsx:76 CharacterDetailFields`（身份/别名/外貌锚点/性格/一致性 Prompt/捏脸/参考音/服装/设定板/五类原图）；
- 复用：`formatAssetMention('character', name)` + `@类型:名` 提及（`blocks/shared/CharacterSelect.tsx`、`AssetMentionInput`）；
- 库间流转：公共库 ↔ 私有库（`stores/public-asset-library.ts`、`AssetDetailCharacterView.tsx:106`）；
- 健康过滤：`asset-library-health.ts:1028 healthFilterItemIds` + `CharacterCardGrid` 的 health 过滤。

**无缺口。** 本轮**未**动这一块。

### 1.6 角色一致性体检

**已存在，且是三套互补而非一套。**

1. **结构性体检（角色维度，11 项）**：`apps/web/src/engine/asset-library-health.ts:637-700`
   - `duplicate`（重名）、`unused`（未被任何镜/节点引用）、
   - `missingPrompt`（`!c.consistencyPrompt?.trim()`，:657）、
   - `invalidRef`（镜表引用了不存在的角色名，:666-670）、
   - `promptDrift`（`characterPromptDrifted`，:674 / 实现 :326）、
   - `missingMedia`（`characterMediaUrls`，:681 / 实现 :178）、
   - `pollution`（多角色共用同一张媒体，:213）、
   - `legacyMention`（镜表裸 `@名`）、`unlocked`、
   - 捏脸三项：`faceRigNotRendered` / `faceRigMetricConflict` / `faceRigMeshStale`
     （:686-698，实现 `assessCharacterFaceRigHealth` :57）。
2. **图像级跨格体检（角色/多格共用）**：
   - 取数壳：`apps/web/src/engine/consistency-check.ts:219 analyzeCellFaces`（限流、同 URL 去重与会话缓存、失败透传不伪造）；
   - 纯函数报告：`packages/shared/src/utils/consistency-report.ts:836 buildConsistencyReport`；
   - 已接：`CharacterSheetWorkspace.tsx:1159`（**角色维度**）与 `MultiGridWorkspace.tsx:1875`；
   - 诚实性：`analyzeCellFaces` 把「分析失败」与「确实无人脸」严格分开（`status: failed` vs `no-face`，:39-49）。
3. **分镜预览的 AI 三维评分**：`storyboard-preview-runner.ts:230-286`
   其中 `character` 维度就是「角色一致性」（:285 label `'角色一致性'`）。

**结论：覆盖到「角色」维度了，不是缺口。** 本轮**未**动这一块。

---

## 2. 本轮补了什么

只补上面判定为**真缺**的两处，且**不新增任何持久化字段名**（全部复用既有字段 / 既有节点 data 键）。

### 补 1：角色 ↔ 声线档案绑定闭环（对应 §1.4）

新增纯函数层 `apps/web/src/engine/character-voice-binding.ts`：

| 函数 | 作用 |
|---|---|
| `resolveCharacterVoiceBinding(c, profiles)` | 解析既有 `voiceProfileId` → 声线档案 → 引擎 `voiceId`；未绑定/档案不存在/`voiceId` 空白 → `null`（**不编造 `alloy` 之类假缺省**） |
| `characterVoiceProfileIdPatch(profileId)` | 只产出**既有字段** `voiceProfileId`（`Object.keys` 恰好为 `['voiceProfileId']`） |
| `buildSpeakerVoiceMapFromCharacters(cs, speakers, profiles)` | 按 speaker 正式名匹配角色 → 产出 speaker → `voiceId`；匹配不到的角色**缺席** |
| `mergeSpeakerVoiceMap(existing, incoming, speakers)` | **只补空位**（用户手选优先）；顺带清理已不在 speakers 的陈旧键 |
| `stripSpeakerVoiceMapForCharacters(...)` | `merge` 的**逆运算**，可清除 |
| `matchCharacterBySpeaker` / `normalizeSpeakerName` / `characterReferenceKey` / `isVoiceProfileVoiceId` | 辅助判定（`char:<id>` 是既有「角色参考音」约定，明确不当作声线档案音色） |

**幂等且可清除，且零新字段**：清除判据**当场算出**——
「该 speaker 的角色此刻绑定的 `voiceId` 与映射值相同 ⇒ 视为自动写入并移除」。
因此**不需要**任何「哪些是自动写入」的持久化标记；用户手选成**非绑定音色**的条目不受影响。
`merge∘strip = id` 有单测覆盖。

接既有控件位：
- **素材库角色面板**（写）：`AssetDetailFields.tsx`「声音与服装」新增「声线档案（引擎音色）」下拉 → 写 `voiceProfileId`；
  候选来自 `voice.profiles`（`AssetDetailCharacterView.tsx` 就近读 `useWorkspaceDocument((s) => s.voice.profiles)`）。
  库里没有声线档案时下拉禁用并显示「暂无声线档案可绑定」（如实空态，不伪造选项）。
- **配音工作区**（读）：`VoiceCastBlock.tsx` 音色映射区新增「按声线档案匹配」/「清除自动匹配」两个按钮，
  只写**既有** `data.profileMap`；无对白说话人 / 角色都没绑定时给**如实原因**，不静默成功。

### 补 2：多角色同框参考图覆盖（对应 §1.3）

新增只读诊断 `apps/web/src/engine/multi-character-ref-coverage.ts`：

- `pickCharacterReferenceUrl(c)`：字段优先级与既有 `pickReferenceImage` **逐字一致**
  （`referenceImageUrl` → `creative.fullSheetUrl` → `creative.frontViewUrl`）；
- `planCharacterReferenceCoverage(characters, slotLimit = 1)` → `{ total, candidates, injected, notInjected, missing, primary }`；
- `hasCharacterReferenceGap` / `describeCharacterReferenceCoverageZh`：无缺口时返回 `null`（不打扰），
  有缺口时只说事实（「仅前 1 位角色的参考图会进生成请求…只靠 Prompt 一致性描述」），**不写「已一致」**。

**关键不变量**：`planCharacterReferenceCoverage(cs).primary` 与既有 `pickReferenceImage(cs, [])` **恒等**，
单测以相对路径直取两个函数的真源码做等价断言 —— 保证「UI 显示注入了哪张」与「实际发送哪张」同源，不会各说各话。

接既有控件位：**分镜镜编辑**（`shot-edit-modal.tsx`「角色预选」面板）追加一行只读提示，
列出「有图但进不了请求」与「完全没有参考图」的角色。纯展示，**不写任何字段**，因此不触碰既有单槽注入行为。

---

## 3. 明确未做（及原因）

| 项 | 为什么不做 |
|---|---|
| 把 `use-bible-image-gen.ts` / `buildBibleImagePrompt` 接到 UI | 它服务的「单图定妆」能力**已被** `generateCharacterMasterSheet` 完整覆盖（§1.1），接线属于**新增冗余**。真实缺陷只剩 `buildBibleImagePatch` 产出非 `CharacterProfile` 字段 `referencePrompt`；因该路径无运行时调用方，改它属无收益改动。**建议**：若要保留 F-037 轻量路径，先定清它与设定板路径的产品分工，再决定接线还是下线 |
| 把多角色参考图从**单槽**改成多槽注入 | 需要改 `pickReferenceImage` / `resolvePictureSendRefs` / 出图·出视频请求体的既有行为与模型能力假设（各模型对多参考图的接受度与语义不同），**超出「只补缺口、不改既有行为」的边界**，且需要产品先定「多参考图在目标模型上的语义」这一无权威依据的问题。本轮**只让它可见**，并在提示里给出可执行的替代路径（多格推演 / 角色设定表） |
| 新增「声线档案」的创建/编辑 UI | `stores/workspace-document.ts:541 addVoiceProfile` 已存在，但**仓库没有任何声线档案编辑界面的既有设计或规格**；凭空造一个属于脑补业务。本轮只做「角色绑定已有档案」这一环，空态如实提示 |
| 修 `packages/shared/src/index.ts` 的 8 个缺失模块 / `apps/web/tsconfig.json` 指向过期 `dist` | 属**硬性边界**（禁止改这 9 个路径的 import，禁止改 barrel）。本报告 §4 只做记录 |
| 改 `sound-gen-runner.ts:113` 的 `?? 'alloy'` 缺省 | 那会**改变既有行为**（角色绑了档案后，原本落 `alloy` 的说话人会变成档案音色）。改为在 `VoiceCastBlock` 给**显式**按钮入口，由用户触发写入 `profileMap` —— 同一效果，零行为变更 |

---

## 4. 未修的既有硬缺陷（记录，不属本轮范围）

- `packages/shared/src/index.ts` 引用了 8 个**不存在**的模块：
  `./data/{emotion-presets, shot-move-families, creative-asset-presets, character-face-rig-presets,
  playbook-definitions, camera-presets, shot-lexicon-taxonomy, provider-registry}`（node 实测：195 条
  `from './...'` 中 8 条解析失败）。⇒ `@nx9/shared` **无法解析**。
- `apps/web/tsconfig.json` 把 `@nx9/shared` 指向 `packages/shared/dist/esm/index.d.ts`，
  而 dist 比 src 陈旧（实测 dist mtime `2026-09-15T08:13:29Z` < src mtime `2026-09-16T00:43:01Z`），
  源码里有、dist 里没有的符号（如 `mergeCameraMoveChannels`、`sanitizeBeats`）在 web 侧全部报
  `TS2305: has no exported member`。
- 后果：web 的 `vitest` 全量 84 个测试文件加载失败、`tsc -b` 265 条错误，**全部**由上述两项派生，非业务缺陷。

---

## 5. 验证口径

### 5.1 新增单测

```
cd apps/web && npx vitest run src/engine/__tests__/digital-human-closure.test.ts --reporter=dot
```

- 结果：`Test Files 1 passed (1)` / `Tests 46 passed (46)`，**exit 0**。
- 测试文件 `apps/web/src/engine/__tests__/digital-human-closure.test.ts` 全部 import 走**相对路径直取源码**
  （含 `../../../../../packages/shared/src/utils/character-prompt`），**不经 `@nx9/shared` barrel**，
  故不受 §4 缺陷影响。
- 覆盖：
  - 解析：未绑定/空串/空白/档案不存在/`voiceId` 空白 → `null`；正常解析；
  - 匹配与产出：按正式名匹配、未绑定角色缺席、speaker 去重；
  - **幂等**：`mergeSpeakerVoiceMap` 第二次 `added === []`、`strip…` 第二次 `removed === []`；
  - **可清除 + 互逆**：`merge` 后 `strip` 回到起点；手选非绑定音色不被误删；
  - **等价守卫**：7 组输入下 `planCharacterReferenceCoverage().primary === pickReferenceImage(cs, [])`；
  - **未造第二套真源守卫**：全仓 `interface CharacterProfile` 恰好 1 处、`resolveCharacterReferenceAudio`
    恰好 1 处定义、新模块无 React 状态/无 `updateNodeData`/无网络/不引 barrel/不含任何疑似新字段名、
    `profileMap` 写入形态未新增、`voiceProfileId` 写入形态未新增、单槽注入实现保持原样。

### 5.2 反向对照（故意写错断言 → 必须失败）

对测试文件做**拷贝备份**后写入两处故意错误（`mergeSpeakerVoiceMap` 幂等断言写反、
等价守卫改成常量 `'__deliberately_wrong__'`），运行得到：

```
EXIT=1
Failed Tests 2
 FAIL … > **幂等**：第二次调用 added 为空、map 不变
   AssertionError: expected [] to deeply equal [ '林小满' ]
 FAIL … > **等价守卫**：primary 恒等于既有 pickReferenceImage(characters, [])
   AssertionError: expected undefined to be '__deliberately_wrong__'
 Test Files  1 failed (1) / Tests  2 failed | 44 passed (46)
```

随后**从备份拷贝恢复**（非 `git show`），复跑回到 `1 passed / 46 passed`，**exit 0**。
⇒ 断言确实有判别力，不是恒真。

### 5.3 全量回归基线对照

```
cd apps/web && npx vitest run --reporter=dot      # 基线（补缺前）
```

- 基线：`Test Files 84 failed | 80 passed (164)`、`Tests 2 failed | 1063 passed | 1 skipped (1066)`，**exit 1**。
- 失败**签名唯一**：node 解析全部输出后，84 个失败文件的错误消息去重后**只有 1 种**——
  `Failed to resolve import "./data/emotion-presets" from "packages/shared/src/index.ts"`（§4 缺陷）。
  2 个失败用例（`DirectorDeskBlock.test.tsx`、`ScriptDeskBlock.test.tsx`）也是同一原因。
- 补缺后：**exit 1，`84 failed | 81 passed (165)` / `2 failed | 1109 passed | 1 skipped (1112)`**
  —— 失败文件数(84)与失败签名(同一条)与基线**完全一致**；新增的 1 个通过文件 / 46 个通过用例即本轮新增单测。
- **逐文件比对**（node 解析两次输出的 `FAIL <path>` 集合并做差集）：
  - 基线 84 个失败文件、补缺后 84 个失败文件；
  - `NEWLY FAILING = []`（零新增失败）；
  - `NEWLY PASSING = []`（零意外翻绿）；
  - 2 个失败用例身份与原因均不变（`DirectorDeskBlock.test.tsx` / `ScriptDeskBlock.test.tsx`
    的 `renders without crashing`，原因同为 `Failed to resolve import "./data/emotion-presets"`）。
- ⇒ 零回归。

### 5.4 类型检查（未通过，如实记录）

```
cd apps/web && npx tsc -b --noEmit     # exit 1，265 条错误
```

- 该命令**在基线即为 exit 1**（§4 两项既有缺陷所致），本轮**未**声称类型检查通过。
- 本轮改动**未新增**类型错误，依据：
  - 两个全新模块与新增测试文件错误数 **0**；
  - 4 个被追加的既有文件中，全部错误行（`shot-edit-modal.tsx:18,20,332,339`；
    `AssetDetailFields.tsx:1214,1242,1267,1288,1321,1969,2437,2457`）**均落在本轮追加区之外**，
    且 `shot-edit-modal.tsx:18,20` 报的 `mergeCameraMoveChannels` / `CameraMoveChannelSource`
    在 `packages/shared/src/index.ts` 里**确实存在**（node 实测），只是 `dist` 过期 —— 属 §4 既有缺陷；
    `VoiceCastBlock.tsx` / `AssetDetailCharacterView.tsx` 错误数 0。
- **语法层另行确认**（类型错误与语法错误正交，故单独验证）：
  - 用 esbuild 逐个 transform 本轮涉及的全部 7 个文件（2 个新模块 + 4 个追加文件 + 新测试），
    **7/7 OK，`syntax-invalid files: 0`，exit 0**；
  - `tsc` 全量输出中 `TS1xxx` 语法类错误 **0 条**。
- ⇒ 本轮改动**语法有效、未新增类型错误**；「类型检查通过」这一结论**未**作出（基线即 exit 1）。

---

## 6. 新增 / 改动文件

### 6.1 全新文件（行数为文件总行数）

| 文件 | 行数 | 内容 |
|---|---|---|
| `apps/web/src/engine/character-voice-binding.ts` | 213 | 补 1 纯函数层 |
| `apps/web/src/engine/multi-character-ref-coverage.ts` | 152 | 补 2 只读诊断 |
| `apps/web/src/engine/__tests__/digital-human-closure.test.ts` | 500 | 46 用例 |
| `docs/NX9-DIGITAL-HUMAN-AUDIT.md` | 346 | 本文 |

### 6.2 既有文件的**逐行归属**（`git diff --numstat` 含会话前未提交改动，故必须切分）

用 `git diff -U0` 逐 hunk 归属，四个文件的 hunk 全部是**纯插入**（`-0`），
即**未删改任何既有行**；`VoiceCastBlock.tsx` 那 5 行删除属**会话前**改动（英文音色选项换成中文目录），与本轮无关。

| 文件 | numstat（vs HEAD） | 其中**本轮** | 其中会话前已有 | 本轮插入的 hunk |
|---|---|---|---|---|
| `blocks/nx9/VoiceCastBlock.tsx` | +73 −5 | **+66 −0** | +7 −5 | `+14,5` 导入；`+69,43` 两个处理函数；`+223,18` 两个按钮 |
| `blocks/craft/storyboard-desk/shot-edit-modal.tsx` | +255 −0 | **+31 −0** | +224 −0 | `+37,4` 导入；`+107,69` 内第 48–68 项（21 行）为「参考图覆盖」两个 `useMemo`；`+799,6` 只读提示 JSX |
| `panels/asset-library/AssetDetailFields.tsx` | +32 −0 | **+32 −0** | 0（会话前未改） | `+74,6` 可选 props；`+97,1` 参数解构默认值；`+392,25` 声线档案下拉与说明 |
| `panels/asset-library/modal/AssetDetailCharacterView.tsx` | +4 −0 | **+4 −0** | 0（会话前未改） | `+3,1` 导入；`+37,2` 读 `voice.profiles`；`+131,1` prop 透传 |

**本轮合计**：新增文件 1211 行 ＋ 既有文件插入 **133 行** = **1344 行**；
其中修改既有行的数量为 **0**（四个文件的 hunk 均为 `+N −0`）。

> 说明：`AssetDetailFields.tsx` `CharacterDetailFieldsProps` 接口末尾与
> `CharacterDetailFields` 参数解构各追加 1 处，属**扩展既有接口**而非改写既有行
> （未改动任何既有字段的类型或默认值）。

## 7. 未验证 / 遗留

- **端到端未验证**：本轮无真实出图调用、无真实 TTS 调用；两个新增入口只有纯函数层单测，
  React 组件层（按钮点击 → 节点 data 写入）**未做组件级测试**，也未跑 Playwright。
- **构建未验证**：`pnpm build` 依赖 `@nx9/shared` 构建，受 §4 缺陷阻断，本轮未跑、未声称通过。
- **未修**：§4 的 barrel 缺失模块与过期 `dist`（边界禁止）。
- **未做**：§3 表格逐项。
