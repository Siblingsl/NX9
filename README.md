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

- **全模块注册表**：60+ 模块类型已注册，核心模块已实现，其余通过 GenericBlock 占位并保持连线兼容
- **性能优先画布**：单工作区挂载、懒加载模块、分级性能模式、可见区域渲染、防抖保存
- **NestJS 后端**：工作区 CRUD、设置、资产上传、API 代理网关
- **Electron 预留**：`platform/runtime-bridge.ts` 抽象桌面能力，Web 模式零改动扩展

## 配色（制作台视觉）

| 用途 | 颜色 |
|------|------|
| 背景 | `#F4F1EA` 暖纸底 |
| 主文字 | `#1A1814` |
| 品牌主色 | `#0F766E` 青绿 |
| 次级色 | `#1E3A5F` 深蓝 |
| 成功 | `#15803D` |
| 警告 | `#C2410C` |
| 分割线 | `#E4DFD6` |

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

| 维度 | NX9 |
|------|-----|
| 后端 | NestJS |
| 画布 | FlowSurface + perf-controller |
| 节点 | blocks/ |
| 状态 | workspace-catalog, credential-vault 等 |
| 主题 | 无主题包，仅基础配色 |
| 桌面 | 预留 `runtime-bridge`，暂未接入 Electron |

## 后续扩展

1. 按模块优先级逐个替换 GenericBlock 为完整实现
2. 补充 gateway 代理路由（RH、FAL、视频、音频等）
3. 接入 Electron 时注入 `window.nx9Desktop`
