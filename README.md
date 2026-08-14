# NX9 Studio

## 架构

```
NX9/
├── apps/
│   ├── server/     NestJS 后端 (port 3001)
│   ├── web/        React + Vite 前端 (port 5173)
│   └── desktop/    Electron 桌面壳（Windows .exe 打包）
├── packages/
│   └── shared/     共享类型、模块目录、端口注册表
└── data/           JSON 持久化
```

## 特性

- **核心 6 步管线**：编剧台 → 分镜台 → 导演台 → 智能剪辑 → 交付打包 → 审片台，全流程 AI 辅助一体化生产
- **双主题 Desk**：暖纸底浅色 + 深色画布双模式；卡片式模块面板，古铜金 (#A67C4A) 品牌主色
- **性能优先画布**：FlowSurface 引擎、懒加载模块、分级性能模式、可见区域渲染、防抖保存
- **NestJS 后端**：工作区 CRUD、设置、资产上传、API 代理网关、Remotion 服务端真渲染
- **19 种工作台模块**：12 个 NX9 自研（nx9Native），涵盖编剧、分镜、导演、配音、剪辑、宫格、交付等全流程
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
| 节点 | 19 种工作台模块 (block-catalog) |
| 3D | Director3d 自研引擎 |
| 渲染 | Remotion / HyperFrames / FFmpeg |
| 状态 | workspace-catalog + flow-graph-mirror |
| 主题 | CSS 变量双主题 (浅/深)，无第三方主题包 |
| 桌面 | Electron 壳 `apps/desktop`，经 `runtime-bridge` 注入 `window.nx9Desktop` |

## 桌面版（Electron / Windows .exe）

`apps/desktop` 是 NX9 的 Electron 桌面壳，负责把「NestJS 服务端 + Web 前端」打成 Windows `.exe`：

- **架构**：主进程挑选空闲端口，用 `utilityProcess` 拉起打包的 NestJS 服务端（cwd 指向数据目录）；**窗口先行**——启动立即显示本地内联启动屏（data: URL，零网络零依赖），服务端 `/api/status` 就绪后同窗口切换到应用地址 `http://127.0.0.1:<port>/`；退出时回收服务端子进程。
- **启动优化**：服务端在 `stage` 阶段用 esbuild 单文件化（`dist/main.js`，纯 JS 依赖 @nestjs/express/rxjs 等全部内联，sharp/remotion/prisma 引擎等原生件外置），把冷启动的文件读取集从数万个小文件降到个位数——Windows 首启杀软逐个扫描小文件造成的 30s+ 启动延迟基本消除；Web 首屏字体样式表改为非阻塞加载，断网也不阻塞登录页渲染。
- **桥接**：`src/preload.ts` 通过 contextBridge 注入 `window.nx9Desktop`，与 `apps/web/src/platform/runtime-bridge.ts` 的 `DesktopBridge` 接口对齐（`openExternal` / `openPath` / `dragAssetOut` 预留）。
- **数据目录**：默认 `exe 同级/nx9-data`（不可写时回退 `%APPDATA%`），可用 `NX9_DATA_DIR` 覆盖。便携版由 NSIS 桩从 `%TEMP%` 解压运行，主进程优先使用桩注入的 `PORTABLE_EXECUTABLE_DIR`（真实 exe 所在目录），避免数据落在每次启动都被清空的临时目录。
- **SQLite 建表**：用户账户（`/api/auth/*` 登录/注册）与用量模块走 Prisma + SQLite，`stage` 阶段会用 `prisma migrate deploy` 生成「已建表的空库」随包携带（`resources/server/prisma/nx9.db`），桌面首启复制为数据目录的 `nx9.db`（`DATABASE_URL=file:nx9.db` 相对服务端 cwd）。老版本数据目录升级时，服务端启动会做一次「缺啥补啥」的运行时幂等迁移（`src/runtime-migration.service.ts`），旧库平滑补建 `AuthSession` 表 / `passwordHash` 列 / `email` 列及唯一索引。
- **账户登录**：首次启动进入登录页，注册账户时若本机存在旧的「默认用户」（未设密码），会自动接管其名下项目数据；之后启动记住本机免登录，可在「设置 → 偏好 → 账户与会话」退出登录切换账户。密码使用 Node `crypto.scrypt` 加盐哈希，会话 token 仅存 SHA-256 摘要（90 天有效）。
- **启动画面**：便携版解压期间显示 `build/splash.bmp`（`scripts/gen-splash.ps1` 生成；NSIS `BgImage` 只认 BMP），避免双击后长时间无反馈。
- **服务端生产开关**（默认关闭，开发零影响）：
  - `NX9_SERVE_WEB=<web dist 目录>`：服务端同源静态托管前端（SPA 回退，`/api`、`/media` 透传）
  - `NX9_REMOTION_BUNDLE_DIR=<compositions dist 目录>`：覆盖 Remotion 组合包路径

### 打包

```bash
# 一次性准备（electron / electron-builder 依赖）
pnpm --filter @nx9/desktop add -D electron electron-builder   # 需网络下载 Electron 运行时

# 完整打包：构建 → 暂存服务端（含 SQLite 迁移建表）→ electron-builder（NSIS 安装版 + 便携版）
pnpm desktop:stage && pnpm desktop:pack

# 仅解包目录（快速验证，不产出安装包）
pnpm desktop:stage && pnpm desktop:pack:dir
```

> 说明：`desktop:pack` 只调用 electron-builder，**必须先跑 `desktop:stage`** 生成最新暂存目录（`apps/desktop/stage/server`）。

产物输出到 `apps/desktop/release/`：

- `NX9-Studio-Setup-<version>.exe` — **安装版**：安装一次，之后秒开（推荐日常使用）
- `NX9-Studio-Green-<version>.zip` — **绿色解压版**：解压一次到任意目录，直接运行 `NX9 Studio.exe`，启动 ~4 秒（免安装、数据存解压目录同级 `nx9-data`）。绿色版由 `scripts/zip-green.ps1` 压缩 `win-unpacked` 产出
- `NX9-Studio-Portable-<version>.exe` — **便携自解压版**：单文件携带最方便，但每次启动都要重新解压 1GB + 杀软扫描（4~5 分钟且可能卡死），**不建议日常使用**，仅作分发备用
- `win-unpacked/` — 解包目录（调试用）

> 说明：打包产物不内置 ffmpeg，剪辑/抽帧等依赖系统 PATH 中的 ffmpeg（与 Web 版行为一致）；存储以 JSON 为主，但用户账户/登录/用量等模块走 Prisma + SQLite（建表库已随包生成并首启播种，见上文；老库启动时自动运行时迁移）。

## 后续扩展

1. 按 [缺陷台账](docs/NX9-PROJECT-DEFECT-ANALYSIS.md) F 项优先级收口至真实 100%（当前 21 项已完成）
2. 补充 gateway 代理路由（视频、音频、TTS 等）
3. 桌面版扩展 `window.nx9Desktop`：文件拖出（dragAssetOut）、本地路径打开、旁路服务（Voicebox / LuxTTS）自动拉起
4. 内置 ffmpeg（约 80MB）实现完全离线剪辑
5. CI / 自动化测试覆盖关键交互回归
