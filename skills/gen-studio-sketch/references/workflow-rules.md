# 工作规则
- 单镜：调用 `buildLineArtShotPrompt` 语义对齐本模板。
- 宫格批量：固定 `2×2`（`pickLineArtGridLayout` / `LINE_ART_GRID_PAGE_SIZE`），用 `buildLineArtPanelGridPrompt`；空位写 EMPTY 白板指令；切分始终 `rows=2, cols=2`，只回填有镜头的格。出图尺寸取横屏（`resolvePictureGenSettings`；方/竖回落 `16:9`），禁止再写死 `1024x1024`。
