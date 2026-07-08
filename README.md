# NX9 Studio

AI 节点工作流工具 — 自 T8-penguin-canvas 功能重构而来，采用全新架构与 UI。

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

## 配色

| 用途 | 颜色 |
|------|------|
| 背景 | `#FAFAF8` |
| 主文字 | `#222222` |
| 品牌主色 | `#A13D63` |
| 次级色 | `#5E4D8A` |
| 成功 | `#2E8B57` |
| 警告 | `#D97706` |
| 分割线 | `#E6E6E6` |

## 开发

```bash
cd F:\code\project\NX9
npm install
npm run dev
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
npm run build -w @nx9/shared
```

`npm run dev` 已自动在启动前构建 shared。

## 与原项目差异

| 维度 | 原项目 | NX9 |
|------|--------|-----|
| 后端 | Express | NestJS |
| 画布 | Canvas.tsx 单体 | FlowSurface + perf-controller |
| 节点 | nodes/ | blocks/ |
| 状态 | 14 个 store | workspace-catalog, credential-vault 等 |
| 主题 | 13 套主题模板 | 无，仅基础配色 |
| 桌面 | Electron 内置 | 预留 bridge，暂未实现 |

## 后续扩展

1. 按模块优先级逐个替换 GenericBlock 为完整实现
2. 补充 gateway 代理路由（RH、FAL、视频、音频等）
3. 接入 Electron 时注入 `window.nx9Desktop`
