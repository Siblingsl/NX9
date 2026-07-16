# NX9 Studio 表面 IA

> **目标**：默认 = 导航选面；主路径 = 制作台全页；画布 = 高级精调。  
> **硬约束**：**无右侧 ContextRail 抽屉**；不恢复编剧/分镜/资源库侧栏。

## 1. 三表面

| 表面 | 路由 key | 用户心智 | 入口 |
|------|----------|----------|------|
| **导航** | `home` | 选工作面 | 打开应用默认 |
| **制作台** | `studio` | 剧本→分镜→生成→配音→导出 | 导航大卡片 |
| **高级画布** | `canvas` | 节点连线专家精调（后期重构 UI） | 导航大卡片 |

## 2. 明确禁止

- `inspectorRail: false`
- `scriptStudio: false`（右侧编剧页）
- `libraryRail: false`
- `productionPathStrip: false`（旧顶栏路径条；制作台页内自有阶段 UI）
- `AppShell` **不得**挂载 `ContextRail`

## 3. 文件

| 文件 | 职责 |
|------|------|
| `stores/app-surface.ts` | home / studio / canvas |
| `pages/HomeNavPage.tsx` | 导航 |
| `pages/ProductionStudioPage.tsx` | 制作台全页 |
| `layout/AppShell.tsx` | 按 surface 挂载；画布无右侧栏 |

## 4. 验收

1. 打开应用先见导航页  
2. 制作台全页无右侧抽屉  
3. 高级画布无右侧抽屉  
4. 可在两面之间切换  
5. 节点执行能力仍在画布侧可用  
