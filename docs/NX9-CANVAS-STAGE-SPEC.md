# 高级画布 · 沉浸式舞台壳

> 替换 IDE 三栏（顶栏 + 左坞 + 标签栏），**不改** FlowSurface / 节点 / 执行器。

## 原型

```
全屏舞台（StageDeck）
  左上浮动：导航 / 制作台 · 项目 chips
  右上浮动：运行状态 · 设置
  底部命令岛：能力(+) · 撤销重做 · 素材 · 命令 · 运行
  能力面板：上浮玻璃面板（角色/场景/生成/输出）可拖可点
```

## 保留功能

- StageDeckSurface 全部节点与连线
- requestSpawn / 拖放 kind
- undo/redo、batch run
- 素材库、设置、历史、日志、Storyboard 面板
- ⌘K 命令面板（若画布内已注册）

## 文件

- `layout/canvas-stage/CanvasStageShell.tsx`
- `layout/canvas-stage/canvas-stage.css`
- `layout/AppShell.tsx`（canvas 面改用 StageShell）
