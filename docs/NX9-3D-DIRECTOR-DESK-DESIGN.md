# NX9 3D 导演台节点设计

> 版本：v1.0
> 日期：2026-08-04
> 范围：NX9 的 3D 导演台节点、`@nx9/director3d` 舞台引擎，以及它与导演台主链的交接。
> 设计依据：NX9 当前代码、`docs/` 规格文档、`约束开发要求.md`。

## 1. 结论

NX9 3D 导演台不应继续作为一个“可以摆几个几何体并截图”的独立预览器，而应改造成：

> 以单个分镜镜头为工作上下文的 3D 构图与机位确认工具；场景可复用，镜头状态必须独立保存；截图和机位数据经导演台统一审阅后，才写回上游链镜表并进入彩色关键帧批出。

目标闭环：

```text
分镜台确认本集构图
  -> 打开导演台
  -> 导演台选择一个镜头
  -> 载入该镜头的角色、场景、线稿和已有 3D 状态
  -> 3D 摆位 / 机位 / 光照预演
  -> 记录候选帧
  -> 选择并确认一张
  -> 导演台审阅
  -> 写回上游 chainStoryboard 的 director3dGuide
  -> 导演台批出彩色关键帧
```

3D 截图是生成参考和构图确认，不是最终彩色关键帧。最终彩色关键帧仍只能由导演台的批出路径生成。

## 2. 设计边界

### 2.1 3D 节点负责

- 按镜头载入角色和场景，提供可解释的 3D 预演。
- 编辑演员位置、旋转、缩放、姿态和可见性。
- 编辑机位位置、目标点、FOV、画幅和基础光照。
- 显示线稿构图参考和安全框，帮助 3D 与分镜构图对齐。
- 记录多张候选帧，并标记当前采用帧。
- 把采用帧的截图、相机参数、角色摆位和版本信息提交给导演台。
- 支持独立使用：无上游镜头时也能创建场景、保存模板、导入导出项目。

### 2.2 3D 节点不负责

- 不修改剧本主文或重新拆镜。
- 不替代分镜台的线稿确认。
- 不直接绕过导演台批出彩色关键帧。
- 不把数据写入全局 `workspace.storyboard.shots` 作为主路径。
- 不把一个全局 3D 场景当作所有镜头的唯一状态。
- 不把“截图成功”伪装成“镜头已审核”或“本集已确认”。

## 3. 对当前实现的分析

当前实现的主要组成是：

- `packages/director3d/src/schema/directorProject.ts`：一个全局 `DirectorProject`，包含 objects、cameras、captures。
- `packages/director3d/src/store/directorStore.ts`：浏览器内 Zustand 单例状态，提供对象编辑和撤销。
- `packages/director3d/src/ui/StageDeckShell.tsx`：舞台壳层，负责载入项目、截图、性能和生命周期。
- `packages/director3d/src/canvas/SceneContent.tsx`：场景渲染、轨道控制器和 TransformControls。
- `apps/web/src/blocks/core/director-desk/director-3d-stage-embed.tsx`：导演台嵌入方式。
- `apps/web/src/panels/Director3dPanel.tsx`：另一条全屏/浮层打开方式。

它几乎不能用于生产的原因如下。

### 3.1 以全局场景为中心，没有以镜头为中心

`DirectorProject` 只有一组 `objects`、一组 `cameras` 和当前相机。宿主通过 `linkedShotId` 告诉舞台“当前关联镜头”，但镜头本身没有独立的 3D project 或 shot state。

结果：

- 切换镜头只是切换一个 id，不是切换完整的镜头工作区。
- 上一个镜头的角色位置、相机、候选帧可能继续影响下一个镜头。
- “场景模板”和“当前镜头摆位”没有边界，修改模板可能改变拍摄中的镜头。
- 用户无法明确知道当前修改是否已经属于某个镜头。

### 3.2 截图是副作用，不是明确的提交事务

当前 `onCapture` 直接把截图上传，并在不同宿主中写入不同位置：

- 嵌入导演台路径直接调用 `useWorkspaceDocument.getState().updateShot`。
- 浮层路径还会写 `workspace.storyboard.shots`、预览节点和 blocking。
- 截图回调没有携带明确的 `shotId`、`episodeId`、`projectVersion`、`source` 和提交状态。

结果：

- 同一个截图可能有多个写回路径。
- 旧截图可能在切镜后写入新镜头。
- 上传成功、写入成功、采用成功、审阅通过被混为一件事。
- 发生刷新或并发更新时，无法判断写回是否覆盖了新版本。

### 3.3 3D 数据没有遵守导演台的链镜表契约

NX9 导演台的生产真相源是上游 `storyboard-desk` 的 `chainStoryboard`。当前 3D 宿主仍存在直接读取和写入全局 storyboard 的路径，尤其是 `Director3dPanel` 的截图处理。

这会导致：

- 断链节点也可能操作画布上无关的镜头。
- 导演台链镜表和全局镜表出现不同步。
- 分集切换依赖全局状态，而不是 handoff 和上游链。
- “3D 参考已提交”无法保证就是当前导演台节点产生的结果。

### 3.4 角色同步只能解决一部分问题

`prepareDirectorProjectForShot` 可以按角色 id 显示/隐藏演员并恢复摆位，但它没有完整处理：

- 场景资产和环境的镜头级绑定。
- 镜头缺失角色、名称冲突、资产加载失败的显式状态。
- 角色从上游变更后的版本提示。
- 用户手工新增演员与上游角色之间的绑定确认。

当前默认演员还是抽象体型和颜色。它可以用于构图预演，但没有明确告诉用户哪些是生产资产、哪些只是占位体。

### 3.5 相机编辑模型不完整

当前相机有 `position`、`rotation`、`scale` 和 `target`，但视口主要依据 `position` 与 `target`计算预览，TransformControls 对相机只同步位置，不同步目标点和完整镜头状态。

因此用户拖动相机后可能看到：

- 视口方向与保存的镜头方向不完全一致。
- 相机标记的位置变了，但 target 没有变。
- 记录帧中的相机参数不能准确复现视口。

### 3.6 候选帧不可管理

Filmstrip 只显示缩略图，没有：

- 选中候选帧。
- 删除、复制、命名、设为采用帧。
- 显示候选帧属于哪个镜头和哪个版本。
- 显示上传中、上传失败、已写回、已采用状态。

“记录帧”因此更像下载一张截图，而不是建立可审阅的镜头候选。

### 3.7 Agent 摆位协议存在，但没有完整接入舞台

`parseAgentPoseCommand` 和 `validatePoseCommand` 能校验 JSON，但现有舞台没有一个清晰的“预览变更 -> 用户确认 -> 应用到当前镜头”的事务层。

如果 Agent 输出直接影响全局 store，就会出现：

- Agent 改错镜头。
- Agent 改动覆盖用户刚刚手工调整的机位。
- 无法撤销一整次 Agent 操作。
- 用户不知道哪些字段来自 Agent。

### 3.8 两条宿主路径造成行为不一致

当前同时存在 `Director3dStageEmbed` 和 `Director3dPanel`。二者对截图、节点数据、故事板预览和镜头写回的处理并不完全一致。

这会造成用户看到的同一个 3D 导演台，在嵌入模式和浮层模式下产生不同结果。生产节点必须只有一个提交服务，宿主只负责提供上下文和 UI 容器。

### 3.9 失败状态和资源状态不够可见

WebGL、模型、全景图、上传、保存、链镜表写回各自可能失败，但当前界面缺少统一的状态层。用户容易把黑屏、空场景或上传失败误判为“已经保存”。

## 4. 新方案的核心模型

### 4.1 三层数据模型

新方案明确拆成三层：

```text
SceneTemplate     可复用的环境和资产布局
ShotStageState    某个镜头的角色、道具、机位、候选帧
ShotGuideCommit   提交给导演台/上游链镜表的不可歧义快照
```

#### SceneTemplate

用于复用，不直接代表某个镜头：

```ts
interface Director3dSceneTemplate {
  id: string;
  version: number;
  name: string;
  environment: {
    panoramaUrl?: string;
    backgroundColor: string;
    ground: { visible: boolean; opacity: number };
    lights: Array<{ id: string; type: 'ambient' | 'directional'; intensity: number; position?: [number, number, number] }>;
  };
  assets: Array<{ id: string; url: string; name: string; kind: 'mesh' | 'panorama' }>;
  objects: Array<{
    id: string;
    name: string;
    assetId?: string;
    kind: 'prop' | 'mesh';
    transform: DirectorTransform;
    visible: boolean;
    locked: boolean;
  }>;
  updatedAt: string;
}
```

角色不固化到模板中，除非明确保存为场景道具。角色来自当前镜头和上游 Bible/资产库。

#### ShotStageState

每个镜头一份，不能被其他镜头隐式共享：

```ts
interface Director3dShotState {
  version: 2;
  shotId: string;
  episodeId?: string | null;
  sourceChainDeskId?: string;
  sourceShotRevision?: number;
  sceneTemplateId?: string | null;
  environment: {
    panoramaUrl?: string;
    backgroundColor: string;
    groundVisible: boolean;
    groundOpacity: number;
    lightingPresetId?: string;
  };
  objects: DirectorShotObject[];
  camera: DirectorShotCamera;
  candidates: Director3dCandidate[];
  selectedCandidateId?: string | null;
  committedCandidateId?: string | null;
  dirty: boolean;
  updatedAt: string;
}
```

`DirectorShotObject` 必须保留 `sourceCharacterId` 或 `sourceAssetId`。不能只依赖显示名称。

`DirectorShotCamera` 必须同时保存：

```ts
interface DirectorShotCamera {
  position: [number, number, number];
  target: [number, number, number];
  rotation: [number, number, number];
  fov: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  move?: string | null;
}
```

#### Director3dCandidate

候选帧是可审阅对象：

```ts
interface Director3dCandidate {
  id: string;
  shotId: string;
  stateVersion: number;
  imageUrl?: string;
  localDataUrl?: string;
  camera: DirectorShotCamera;
  characterPlacements: StoryboardDirectorCharacterPlacement[];
  prompt: string;
  status: 'capturing' | 'uploading' | 'ready' | 'failed' | 'committed';
  error?: string;
  createdAt: string;
}
```

### 4.2 单一提交契约

3D 引擎不能直接写 workspace。它只向宿主发出事件：

```ts
interface Director3dCommitPayload {
  version: 1;
  commitId: string;
  blockId?: string;
  shotId: string;
  episodeId?: string | null;
  sourceShotRevision?: number;
  candidate: Director3dCandidate;
  sceneState: Director3dShotState;
  committedAt: string;
}
```

由 `DirectorDeskBlock` 的适配器执行：

1. 校验 `shotId` 仍属于当前上游 chain。
2. 校验 `sourceShotRevision` 没有落后；落后则提示重新载入，不覆盖新内容。
3. 把 `candidate` 映射为 `director3dGuide`。
4. 通过 `patchUpstreamShot` 写回上游 `chainStoryboard`。
5. 记录节点级 `sceneByShot` 和 `last3dCommit`。
6. 触发导演台显示“3D 构图已提交，可进入彩色关键帧批出”。

3D 引擎只负责 `onCommit(payload)`，不能调用 `updateShot`、workspace store 或全局 storyboard。

### 4.3 写回字段

`director3dGuide` 至少包含：

- `sourceBlockId`
- `captureId`
- `captureUrl`
- `cameraPrompt`
- `cameraPosition`
- `cameraRotation`
- `cameraFov`
- `panoramaUrl`
- `characterPlacements`
- `appliedAt`
- `commitId`
- `shotId`
- `sourceShotRevision`

3D 状态本身写入导演台节点的 `sceneByShot[shotId]`，而不是覆盖整个 `scene`。旧 `scene` 可在迁移期只读兼容，禁止继续作为多镜头主存储。

## 5. 用户界面设计

### 5.1 顶部上下文栏

顶部必须固定显示：

```text
导演台 / 第 2 集 / 镜头 08
来源：分镜台 · 已确认构图
角色 2 · 线稿已载入 · 3D 构图未提交
```

右侧操作：

- 上一镜 / 下一镜。
- 跳转镜头列表。
- 重新载入上游。
- 保存当前镜头。
- 提交采用帧。
- 关闭。

没有 `shotId` 时必须显示“独立场景模式”，不能显示“已关联镜头”。

### 5.2 三栏工作区

```text
+----------------+------------------------------+------------------+
| 镜头列表       | 3D 视口                      | 当前镜头检查器   |
|                |                              |                  |
| #07 已提交     | 线稿 / 3D / 对比             | 角色              |
| #08 编辑中     | 安全框 / 地面 / 机位锥体      | 位置/旋转/姿态    |
| #09 未开始     |                              | 相机              |
|                |                              | FOV/目标/运镜     |
+----------------+------------------------------+------------------+
| 候选帧胶片条：候选 A  候选 B  采用中  上传失败重试                |
+------------------------------------------------------------------+
```

### 5.3 视口模式

- `构图`：俯视/自由视角，显示演员、道具、相机和安全框。
- `镜头`：只显示最终相机视角，禁用会改变镜头结果的自由拖拽。
- `对比`：左侧线稿，右侧 3D 截图；默认线稿为构图验收依据。
- `诊断`：显示对象 id、来源资产、加载状态、当前 state version。

### 5.4 镜头切换规则

切换镜头前：

- 若当前镜头没有修改，直接切换。
- 若有未保存修改，显示“保存并切换 / 放弃修改 / 取消”。
- 切换后必须替换完整 `ShotStageState`，不能只改变 `linkedShotId`。
- 任何异步截图上传回调必须携带并校验创建时的 `shotId`。

### 5.5 候选帧规则

- “记录候选帧”只创建 candidate，不立即写回上游镜头。
- 截图上传失败时保留本地 candidate，并提供重试。
- 用户可预览、命名、删除候选帧。
- “采用此帧”只改变当前镜头本地状态。
- “提交到导演台”才触发唯一提交契约。
- 提交成功后候选帧状态为 `committed`，并显示提交时间和 commit id。

## 6. 与导演台节点的配合

### 6.1 从分镜台进入

分镜台交接页只做两件事：确认本集、打开导演台。打开时传递：

```ts
interface DirectorDeskHandoff {
  from: 'storyboard-desk';
  fromBlockId: string;
  episodeId: string;
  shotIds: string[];
  lineArtFrames: Array<{ sourceShotId: string; imageUrl: string }>;
  chainRevision: number;
  at: string;
}
```

导演台收到 handoff 后：

1. 只读取 handoff 指定的链镜表。
2. 只显示当前集镜头。
3. 按 `sourceShotId` 匹配线稿。
4. 为每个镜头加载 `sceneByShot[shotId]`，没有则从场景模板和上游角色初始化。
5. 在顶部显示确认态、线稿覆盖率和 3D 提交覆盖率。

### 6.2 3D 提交后的导演台流程

```text
3D 构图提交
  -> 导演台镜头状态：3D 参考已就绪
  -> 选择镜头 / 批出设置
  -> 线稿 + 3D + 角色 + 场景进入 prompt reference
  -> 生成彩色关键帧
  -> 手动/自动审阅
  -> 批准后推 clip-gen
```

3D 提交不改变 `firstFrameAssetId`，不自动批准关键帧，也不自动推视频。它只更新 `director3dGuide` 和导演台参考状态。

### 6.3 导演台批出规则

- 默认参考优先级：3D 采用帧 > 线稿 > 角色 > 场景。
- 若用户关闭 `prefer3dRef`：线稿 > 角色 > 场景，3D 仍保留为附加信息。
- 3D 无提交时允许预览和批出，但在批出前提示“本镜头没有 3D 构图参考”。
- 批出和审阅仍由导演台 runner 负责，3D 节点不调用生成 API。

## 7. 独立使用方式

独立使用不是导演台主链的替代入口，而是一个可复用的场景构图工具。

### 7.1 创建独立场景

1. 在画布放置 3D 导演台节点，未连接分镜台。
2. 顶部显示“独立场景模式”。
3. 新建场景或导入 `Director3dProject`。
4. 添加角色占位体、道具、网格或全景环境。
5. 调整机位和画幅。
6. 记录候选帧。
7. 保存为场景模板或导出 JSON。

独立模式的保存目标是节点数据和素材库，不写任何 storyboard shot。

### 7.2 独立场景转为镜头工作区

用户连接分镜台并选择镜头后：

- 场景模板只作为初始环境。
- 角色按上游角色 id 重新绑定。
- 当前镜头获得一份独立 `ShotStageState`。
- 后续修改不会反向修改模板。

### 7.3 独立模式的限制

- 没有上游镜头时，不能使用“提交到导演台”。
- 可以保存候选帧、场景模板和项目文件。
- 可以复制场景到有上游的导演台节点。
- 界面明确显示“未连接分镜台，当前结果不会进入彩色关键帧生产链”。

## 8. Agent 摆位设计

Agent 不直接改 store，采用预览事务：

```text
Agent JSON
  -> validatePoseCommand
  -> 绑定当前 shotId
  -> 生成 diff
  -> 用户查看“将移动哪些角色/相机”
  -> 应用到当前 ShotStageState
  -> 一次撤销
```

协议保留 `version: 1`，但应用层新增上下文包装：

```ts
interface Director3dPoseRequest {
  shotId: string;
  baseStateVersion: number;
  command: Director3dPoseCommand;
}
```

应用前必须检查：

- command 的角色能绑定当前镜头角色或明确提示未绑定。
- base state version 没有过期。
- 相机和角色坐标在约束范围内。
- 用户确认后才写入 state。

## 9. 性能与可靠性保证

### 9.1 数据可靠性

- 每个镜头独立 state，禁止用单例 project 表示全部镜头。
- 所有异步回调携带 `shotId` 和 `stateVersion`。
- 写回使用 `commitId` 幂等，重复回调不会重复覆盖。
- 写回前检查上游 chain revision。
- 上传失败保留 candidate，不丢失用户构图。
- 关闭节点或刷新前，dirty 状态必须拦截。

### 9.2 渲染可靠性

- WebGL 不可用时显示明确降级说明，不显示空白舞台。
- 模型/全景加载显示独立错误卡和重试按钮。
- 后台 Tab 降低 DPR，恢复时重新测量视口。
- 关闭节点调用统一 dispose，清理 geometries、materials、textures 和 renderer。
- `three` 必须由使用方直接声明依赖和类型，不依赖偶然 hoisting。

### 9.3 交互可靠性

- “记录候选帧”“采用此帧”“提交到导演台”是三个不同按钮。
- 所有破坏性操作使用 NX9 现有确认机制。
- 当前镜头、集数、链来源始终可见。
- 对比模式优先用于检查线稿构图，而不是只看 3D 美观度。
- 空状态告诉用户下一步，而不是只显示一个空 Canvas。

## 10. 与当前方案的区别

| 维度 | 当前实现 | 新方案 |
|---|---|---|
| 核心对象 | 全局 DirectorProject | 每镜头 ShotStageState + 可复用 SceneTemplate |
| 切镜 | 修改 linkedShotId，复用场景 | 保存/加载完整镜头状态 |
| 截图 | 记录后宿主直接写回 | candidate -> 采用 -> commit 三阶段 |
| 写回 | 多宿主直接 updateShot / 全局 storyboard | 单一 onCommit，由导演台适配器 patch 上游 chain |
| 相机 | position/target 可能不同步 | position/target/rotation/FOV 同一快照 |
| 角色 | 名称和 id 混用，主要是占位体 | sourceCharacterId 强绑定，加载状态可见 |
| 场景 | 与当前镜头混在一起 | 模板与镜头状态分离 |
| 候选帧 | 只显示缩略图 | 有版本、状态、采用和提交信息 |
| Agent | 校验协议但缺少事务上下文 | shotId + stateVersion + diff + 一次撤销 |
| 导演台关系 | 3D 可直接影响全局镜头/预览 | 3D 只提交参考，彩色批出仍归导演台 |
| 独立使用 | 能运行但边界不清 | 明确独立模式，不能伪装进入主链 |
| 失败处理 | 多数依赖 log | 上传、加载、写回、WebGL 都有可操作状态 |

## 11. 实施方案

### Phase 1：先堵住数据错误

- 新增 `Director3dShotState`、`Director3dCandidate`、`Director3dCommitPayload` 类型。
- 将 `scene` 迁移为 `sceneByShot`，保留旧 `scene` 只读迁移。
- 新增统一 `Director3dCommitAdapter`，移除引擎内所有 workspace 写回。
- 让嵌入路径和浮层路径共用同一个 adapter。
- 增加 shot id、episode id、chain revision 校验。

验收：同一节点切换两个镜头，分别调整位置并刷新，两个镜头状态互不串；提交只能写当前上游链镜头。

### Phase 2：重做镜头工作区

- 顶部上下文栏和镜头列表。
- 切镜保存/放弃/取消门禁。
- 线稿、3D、对比三种视口模式。
- 相机 target 编辑和完整快照。
- 候选帧状态机和胶片条操作。

验收：用户可以从镜头 08 记录两张候选帧，采用第二张，提交后只更新镜头 08 的 `director3dGuide`。

### Phase 3：接通导演台主链

- 从 `lastHandoff` 和 chain storyboard 载入当前集。
- 3D 参考进入 `buildShotPrompt` 的参考链。
- 导演台顶部显示 3D 提交覆盖率。
- 没有 3D 参考时可预览，但批出前显示非阻断提示。

验收：3D 提交后导演台能看到正确镜头的 3D 参考；批出仍由导演台 runner 完成，且不读全局无关镜表。

### Phase 4：独立模式和模板

- 独立场景空态。
- 场景模板保存、复制、导入导出。
- 模板应用到镜头时执行深拷贝和角色重绑定。

验收：修改镜头状态不会改变模板；独立模式不会写 storyboard。

### Phase 5：Agent、性能和回归

- Agent diff 预览和确认。
- WebGL/资源/上传错误卡。
- dirty 拦截、commit 幂等、dispose 回归。
- 补齐单元测试、组件测试和 Playwright 主链验收。

## 12. 必须通过的测试

### 数据契约测试

- `normalizeDirectorProject` 能迁移旧 `scene` 到默认镜头状态。
- `sceneByShot` 不会共享对象引用。
- 不同 `shotId` 的状态互不影响。
- 旧 `sourceShotRevision` 提交会被拒绝。
- 重复 `commitId` 不会重复写回。
- 无上游链时禁止 commit，但允许保存独立场景。

### 视口与相机测试

- position、target、rotation、FOV 保存后能恢复同一视图。
- 切换俯瞰/镜头/对比模式不改变镜头 state。
- 隐藏角色不会进入提交的 characterPlacements。
- 线稿比例和 3D 画幅一致。

### 交接测试

- 分镜台 handoff 只载入指定集。
- 线稿按 `sourceShotId` 正确匹配。
- 3D commit 只调用 `patchUpstreamShot` 适配器。
- 3D commit 不修改 `firstFrameAssetId`，不自动批准，不推 clip-gen。
- 导演台批出读取 3D reference 的优先级符合设置。

### 失败和生命周期测试

- 上传失败 candidate 可重试。
- 切镜和关闭 dirty 状态有拦截。
- WebGL 不可用显示降级界面。
- 模型和全景加载失败可重试。
- 关闭后 renderer 和资源 dispose。
- 后台/恢复不会丢失当前镜头状态。

### 浏览器验收主路径

1. 编剧台生成并确认剧本。
2. 分镜台拆镜、生成线稿、确认本集。
3. 打开导演台，确认集数和镜头来源正确。
4. 进入 3D 舞台，选择镜头 08。
5. 载入线稿和角色，调整演员与相机。
6. 记录两张候选帧，采用第二张。
7. 提交到导演台，刷新后确认仍在镜头 08。
8. 返回导演台批出彩色关键帧。
9. 确认 3D 参考只影响镜头 08，不影响其他镜头。
10. 断开上游后独立使用，确认不会写入 storyboard。

## 13. 不采用的方案

- 不继续在 `Director3dPanel` 和 `Director3dStageEmbed` 各自实现一套写回逻辑。
- 不通过增加更多字段继续扩大全局 `DirectorProject`。
- 不把截图直接作为 `firstFrameAssetId`，绕过导演台审阅。
- 不用显示名称作为角色唯一键。
- 不以全局 `workspace.storyboard.shots` 作为 3D 节点镜头列表的回退主源。
- 不把 Agent JSON 直接 merge 到 Zustand store。
- 不用“默认自动保存”掩盖未提交、上传失败或链版本冲突。

## 14. 最终产品口径

用户应该能清楚回答四个问题：

1. 我现在正在编辑哪一集、哪一个镜头？
2. 这张 3D 图只是候选，还是已经提交给导演台？
3. 这个位置来自当前镜头、场景模板，还是 Agent 建议？
4. 它会不会影响其他镜头或直接变成最终彩色帧？

新设计的答案分别是：顶部上下文和 shot state；candidate/commit 状态；来源绑定和操作 diff；不会，只有导演台适配器会把采用结果写入当前上游链镜头，彩色关键帧仍由导演台批出。
