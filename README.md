# NX9 Studio

## 架构

```
NX9/
├── apps/
│   ├── server/     NestJS 后端 (port 3001)
│   └── web/        React + Vite 前端 (port 5173)
├── packages/
│   └── shared/     共享类型、模块目录、端口注册表
└── data/           JSON 持久化
```

## 特性

- **核心 6 步管线**：编剧台 → 分镜台 → 导演台 → 智能剪辑 → 交付打包 → 审片台，全流程 AI 辅助一体化生产
- **双主题 Desk**：暖纸底浅色 + 深色画布双模式；卡片式模块面板，古铜金 (#A67C4A) 品牌主色
- **性能优先画布**：FlowSurface 引擎、懒加载模块、分级性能模式、可见区域渲染、防抖保存
- **NestJS 后端**：工作区 CRUD、设置、资产上传、API 代理网关、Remotion 服务端真渲染
- **18 种工作台模块**：11 个 NX9 自研（nx9Native），涵盖编剧、分镜、导演、配音、剪辑、宫格、交付等全流程
- **Electron 预留**：`platform/runtime-bridge.ts` 抽象桌面能力，Web 模式零改动扩展

## 配色（画布 / Desk 视觉）

| 用途 | 浅色 | 深色 |
|------|------|------|
| 画布底 | `#E8E4DB` | `#0C0E12` |
| 面板底 | `#F7F4EE` | `#161719` |
| 卡片底 | `#FBF9F5 → #F3EFE7` | `#1A1C1F → #141618` |
| 品牌主色 | `#A67C4A` 古铜金 | `#C4A574` |
| 主文字 | `rgba(32,28,24,0.92)` | `rgba(236,232,224,0.92)` |
| 次文字 | `rgba(32,28,24,0.55)` | `rgba(236,232,224,0.55)` |
| 分割线 | `rgba(42,36,28,0.1)` | `rgba(255,255,255,0.08)` |
| 成功 | `#4A8A62` | `#8FB89A` |
| 警告 | `#C4834A` | `#D4A574` |

> 颜色体系由 `desk-palette.css` + `tokens.css` + `tailwind.config.js` 三层定义，通过 CSS 变量切换深浅主题。

## 开发

需安装 [pnpm](https://pnpm.io/installation)（推荐通过 Corepack 启用）：

```bash
corepack enable
corepack prepare pnpm@10.32.0 --activate
```

```bash
cd F:\code\project\NX9
pnpm install
pnpm run dev
```

- 前端: http://127.0.0.1:5173
- 后端: http://127.0.0.1:3001

### 常见问题

**端口被占用 (EADDRINUSE)**：先关闭之前的 dev 进程，或在 PowerShell 中：

```powershell
Get-NetTCPConnection -LocalPort 3001,5173 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
```

**构建报错 `BLOCK_GROUPS is not exported`**：先构建 shared 包：

```bash
pnpm --filter @nx9/shared build
```

`pnpm run dev` 已自动在启动前构建 shared。

## 技术栈（NX9 自研）

| 维度 | 实现 |
|------|------|
| 后端 | NestJS (Express) |
| 前端 | React 19 + Vite |
| 画布 | FlowSurface + perf-controller + desk-palette |
| 节点 | 18 种工作台模块 (block-catalog) |
| 3D | Director3d 自研引擎 |
| 渲染 | Remotion / HyperFrames / FFmpeg |
| 状态 | workspace-catalog + flow-graph-mirror |
| 主题 | CSS 变量双主题 (浅/深)，无第三方主题包 |
| 桌面 | 预留 `runtime-bridge`，暂未接入 Electron |

## 后续扩展

1. 按 [缺陷台账](docs/NX9-PROJECT-DEFECT-ANALYSIS.md) F 项优先级收口至真实 100%（当前 21 项已完成）
2. 补充 gateway 代理路由（视频、音频、TTS 等）
3. 接入 Electron 时注入 `window.nx9Desktop`
4. CI / 自动化测试覆盖关键交互回归
