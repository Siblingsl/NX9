# NX9 制作台 · 独立剧集生产系统

> 制作台 **不是** 画布的附庸。画布是专家精调面；制作台是默认做剧面。

## 1. 三枢纽

| 枢纽 | 职责 |
|------|------|
| **剧集架** | 多集列表、完成归档、成片链接、新建下一集、全剧美术方向 |
| **资产库** | 角色 / 场景 / 声音（跨集复用） |
| **本集制作** | 当前 `activeEpisodeId` 下的 7 步流水线 |

## 2. 本集 7 步

1. 剧本  
2. 分镜表（景别·运镜·色调·光影·声音方向·专业提示词）  
3. **分镜预览图**（故事板关键帧静帧，非成片）  
4. 批审预览图  
5. 镜头视频  
6. 声音  
7. 导出归档  

## 3. 做完的集在哪 / 下一集怎么做

- 导出后点 **「完成本集并归档」** → `EpisodeMeta.status = completed`，`exportHistory` / `lastExportUrl` 保留  
- 在 **剧集架** 查看所有集与成片链接  
- **「新建下一集」** → 新 `episodeId` 并切换 `activeEpisodeId`，本集制作区只显示新集镜头  
- 批量出图/视频/导出只处理 `activeEpisodeShots`

## 4. 数据

- `StoryboardPayload.episodes[]`、`exportHistory[]`、`globalArtDirection`  
- `StoryboardShot.cameraMove / colorGrade / lighting / audioDirection / imagePromptPro / videoPromptPro`  
- 专业提示词：`packages/shared/src/utils/studio-prompt-builder.ts`

## 5. 本轮已补强

| 能力 | 说明 |
|------|------|
| 角色参考图 | 资产库上传 / 更换 / 清除 |
| 角色克隆参考音 | 上传后批量 TTS 优先 LuxTTS |
| 场景多参考图 | 主图 + 追加（最多 6） |
| 批量 TTS | 声音步 / 资产库：`proxyTts`，写回 `audioAssetId` |
| 镜头排序 | 分镜表卡片 ↑↓ 调整本集 index |

## 6. 与画布关系

| | 制作台 | 高级画布 |
|--|--------|----------|
| 定位 | 默认做剧 | 专家连线 |
| 事实来源 | 镜头表 + 剧集架 + 资产库 | 节点图 |
| 复用 | runner / prompt / assets | 同左 |
| UI | 通告台全页 | 节点壳（后期重构） |
