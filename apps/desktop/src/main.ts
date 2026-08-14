/**
 * NX9 Studio — Electron 主进程。
 *
 * 职责：
 *  1. 解析可写的数据目录（默认 exe 同级 nx9-data，不可写时回退 %APPDATA%）。
 *  2. 挑选空闲端口，以 utilityProcess 拉起打包的 NestJS 服务端
 *     （dist/main.js，cwd = 数据目录，注入 NX9_SERVE_WEB / NX9_REMOTION_BUNDLE_DIR 等）。
 *  3. 轮询 /api/status 就绪后打开主窗口（同源加载 http://127.0.0.1:<port>/）。
 *  4. 退出时确保服务端子进程被回收。
 */
import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from 'electron';
import { copyFileSync, cpSync, createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { AddressInfo, createServer } from 'net';
import { dirname, join, resolve } from 'path';

const APP_TITLE = 'NX9 Studio';
const SERVER_READY_TIMEOUT_MS = 90_000;
const SERVER_LOG_MAX_BYTES = 8 * 1024 * 1024;

/**
 * 启动屏（data: URL 内联，零依赖、零网络）。
 * 窗口先于服务端就绪打开，双击后 ~1s 即有画面反馈；
 * 服务端就绪后同窗口切换到真实应用地址（登录页）。
 */
const SPLASH_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><style>
html,body{margin:0;height:100%;background:radial-gradient(1200px 700px at 50% 32%,#1d1f24 0%,#161719 45%,#0c0e12 100%);color:#f4f1ea;font-family:'Segoe UI','Microsoft YaHei',system-ui,sans-serif;overflow:hidden;-webkit-user-select:none;user-select:none}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px}
.mark{position:relative;width:92px;height:92px;animation:breathe 2.6s ease-in-out infinite}
.mark svg{display:block;width:100%;height:100%;filter:drop-shadow(0 0 22px rgba(185,150,100,.45))}
.glow{position:absolute;inset:-28px;background:radial-gradient(closest-side,rgba(185,150,100,.22),transparent 70%);animation:breathe 2.6s ease-in-out infinite}
.title{font-size:26px;font-weight:600;letter-spacing:6px;background:linear-gradient(100deg,#c4a574 0%,#b99664 45%,#e8d5ae 60%,#b99664 75%,#78542e 100%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:sheen 3.2s linear infinite}
.sub{margin-top:2px;font-size:12px;letter-spacing:4px;color:rgba(196,165,116,.62)}
.hint{position:absolute;bottom:34px;left:0;right:0;text-align:center;font-size:12px;letter-spacing:2px;color:rgba(244,241,234,.35);animation:blink 1.6s ease-in-out infinite}
@keyframes breathe{0%,100%{opacity:.82;transform:scale(.985)}50%{opacity:1;transform:scale(1.015)}}
@keyframes sheen{0%{background-position:0% 0}100%{background-position:-220% 0}}
@keyframes blink{0%,100%{opacity:.28}50%{opacity:.65}}
</style></head><body><div class="wrap">
<div class="mark"><div class="glow"></div><svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="g" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse"><stop stop-color="#B99664"/><stop offset="1" stop-color="#78542E"/></linearGradient></defs>
<rect x="26" y="10" width="6" height="6" rx="1.5" fill="url(#g)"/>
<rect x="26" y="24" width="6" height="6" rx="1.5" fill="url(#g)"/>
<rect x="26" y="38" width="6" height="6" rx="1.5" fill="url(#g)"/>
<rect x="26" y="52" width="6" height="6" rx="1.5" fill="url(#g)"/>
<rect x="26" y="66" width="6" height="6" rx="1.5" fill="url(#g)"/>
<rect x="26" y="80" width="6" height="6" rx="1.5" fill="url(#g)"/>
<rect x="40" y="10" width="42" height="76" rx="8" stroke="url(#g)" stroke-width="3.2"/>
<path d="M46 66 L56 44 L63 56 L69 48 L76 66 Z" fill="url(#g)" opacity=".92"/>
<circle cx="58" cy="32" r="7" fill="url(#g)"/>
</svg></div>
<div class="title">NX9 STUDIO</div>
<div class="sub">AI 影视创作工作台</div>
</div><div class="hint">正在启动引擎 · 请稍候</div></body></html>`;

let dataDir = '';
let serverProcess: Electron.UtilityProcess | null = null;
let serverLogStream: ReturnType<typeof createWriteStream> | null = null;
let serverExited = false;
let quitting = false;
/** 主进程启动计时起点（app ready 前），供里程碑日志使用 */
let tBootStart = Date.now();

/** 数据目录：NX9_DATA_DIR > exe 同级 nx9-data（可写则用，不可写回退 userData） */
function resolveDataDir(): string {
  if (process.env.NX9_DATA_DIR) {
    const forced = resolve(process.env.NX9_DATA_DIR);
    mkdirSync(forced, { recursive: true });
    return forced;
  }
  if (app.isPackaged) {
    // 便携版由 NSIS 桩从 %TEMP% 解压运行，process.execPath 指向临时目录；
    // 桩会注入 PORTABLE_EXECUTABLE_DIR（真实 exe 所在目录），数据应落在那里，
    // 否则每次启动解压目录被清空时数据会一并丢失。
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    const baseDir = portableDir || dirname(process.execPath);
    const candidate = join(baseDir, 'nx9-data');
    try {
      mkdirSync(candidate, { recursive: true });
      const probe = join(candidate, '.write-probe');
      writeFileSync(probe, 'ok');
      rmSync(probe);
      return candidate;
    } catch {
      const fallback = join(app.getPath('userData'), 'nx9-data');
      mkdirSync(fallback, { recursive: true });
      return fallback;
    }
  }
  // 开发模式（electron .）：数据落在 apps/desktop/.dev-data，不污染 monorepo 根 data/
  const dev = resolve(__dirname, '..', '.dev-data');
  mkdirSync(dev, { recursive: true });
  return dev;
}

/** 打包后的资源目录布局：resources/{server,web,compositions} */
function resolveServerEntry(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'server', 'dist', 'main.js');
  }
  return resolve(__dirname, '..', '..', 'server', 'dist', 'main.js');
}

function resolveWebDist(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'web');
  return resolve(__dirname, '..', '..', 'web', 'dist');
}

function resolveCompositionsDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'compositions');
  return resolve(__dirname, '..', '..', 'remotion-compositions', 'dist');
}

/**
 * 服务端 Hyperframes 按 cwd/templates/hyperframes 解析渲染模板；
 * 打包后 cwd = 数据目录，首次启动时把 resources/server/templates 播种过去。
 */
function seedRuntimeAssets(): void {
  if (!app.isPackaged) return;
  const srcTemplates = join(process.resourcesPath, 'server', 'templates');
  const dstTemplates = join(dataDir, 'templates');
  if (existsSync(srcTemplates) && !existsSync(dstTemplates)) {
    try {
      cpSync(srcTemplates, dstTemplates, { recursive: true });
    } catch {
      /* 播种失败不致命：仅 Hyperframes 渲染不可用 */
    }
  }
  // SQLite：打包环境 DATABASE_URL=file:nx9.db（相对服务端 cwd = 数据目录），
  // 指向全新空库；stage 阶段已用 prisma migrate deploy 生成「已建表的空库」，
  // 首次启动复制过去，否则 /api/users/bootstrap 会因表不存在而 500。
  const srcDb = join(process.resourcesPath, 'server', 'prisma', 'nx9.db');
  const dstDb = join(dataDir, 'nx9.db');
  if (existsSync(srcDb) && !existsSync(dstDb)) {
    try {
      copyFileSync(srcDb, dstDb);
    } catch {
      /* 复制失败非致命：仅用户相关模块不可用 */
    }
  }
}

function pickFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      server.close(() => resolvePort(port));
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function openServerLog(): void {
  const logFile = join(dataDir, 'nx9-server.log');
  try {
    serverLogStream = createWriteStream(logFile, { flags: 'a' });
  } catch {
    serverLogStream = null;
  }
}

function writeServerLog(chunk: string): void {
  if (!serverLogStream) return;
  try {
    const head = serverLogStream.bytesWritten;
    if (head >= SERVER_LOG_MAX_BYTES) {
      serverLogStream.end();
      serverLogStream = createWriteStream(join(dataDir, 'nx9-server.log'), { flags: 'w' });
    }
    serverLogStream.write(chunk);
  } catch {
    /* 日志失败不致命 */
  }
}

/** 轮询服务端 /api/status，返回是否就绪（100ms 高频探测，就绪后尽快开窗） */
async function waitForServerReady(port: number): Promise<boolean> {
  const url = `http://127.0.0.1:${port}/api/status`;
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (serverExited) return false;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      /* 服务未起，继续重试 */
    }
    await sleep(100);
  }
  return false;
}

function startServer(port: number): void {
  const serverEntry = resolveServerEntry();
  if (!existsSync(serverEntry)) {
    dialog.showErrorBox(
      APP_TITLE,
      `服务端入口不存在：${serverEntry}\n请确认已执行 pnpm --filter @nx9/desktop pack 前的构建步骤。`,
    );
    app.exit(1);
    return;
  }

  openServerLog();

  const childEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NX9_HOST: '127.0.0.1',
    NX9_PORT: String(port),
    NX9_SERVE_WEB: resolveWebDist(),
    NX9_REMOTION_BUNDLE_DIR: resolveCompositionsDir(),
    NX9_STORAGE: process.env.NX9_STORAGE ?? 'json',
    // PrismaClient 构造时即解析 DATABASE_URL，缺省会直接抛错；
    // 默认 JSON 存储下不实际使用，但需要提供一个可用的 SQLite 路径。
    // 注意：必须用绝对路径 —— 相对路径（file:nx9.db）会被 Prisma 解析到
    // 生成 client 所在目录（node_modules/.prisma/client/），导致连到空库而查不到表。
    DATABASE_URL:
      process.env.DATABASE_URL ?? `file:${join(dataDir, 'nx9.db').split('\\').join('/')}`,
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  serverProcess = utilityProcess.fork(serverEntry, [], {
    cwd: dataDir,
    env: childEnv,
    stdio: 'pipe',
  });

  const forward = (chunk: Buffer | string | null | undefined) => {
    if (chunk != null) writeServerLog(String(chunk));
  };
  serverProcess.stdout?.on('data', forward);
  serverProcess.stderr?.on('data', forward);

  serverProcess.on('exit', (code) => {
    serverExited = true;
    writeServerLog(`\n[NX9] server process exited with code ${code}\n`);
    serverLogStream?.end();
    serverLogStream = null;
    if (code !== 0 && !quitting) {
      dialog.showErrorBox(
        APP_TITLE,
        `NX9 服务端异常退出（code=${code}）。\n日志：${join(dataDir, 'nx9-server.log')}`,
      );
      app.quit();
    }
  });

  writeServerLog(`\n[NX9] server started: ${serverEntry} port=${port} cwd=${dataDir}\n`);
}

/**
 * 创建主窗口：立即加载本地启动屏（data: URL，零网络零依赖），
 * 服务端就绪后由 loadAppInto 切换到真实应用地址。
 */
function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: APP_TITLE,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0C0E12',
    icon: app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // 外部链接一律交给系统浏览器，不在应用内开新窗
    if (/^https?:\/\//.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // 里程碑日志：记录启动屏 / 应用页的加载完成时刻（写入 nx9-server.log 供实测）
  win.webContents.on('did-finish-load', () => {
    writeServerLog(`[NX9] window did-finish-load at ${Date.now() - tBootStart}ms (url=${win.webContents.getURL().slice(0, 40)})\n`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    writeServerLog(`[NX9] window did-fail-load code=${code} ${desc}\n`);
  });

  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SPLASH_HTML));

  return win;
}

/** 服务端就绪后，把已显示的窗口切换到应用主页（登录页） */
function loadAppInto(win: BrowserWindow, port: number): void {
  win.loadURL(`http://127.0.0.1:${port}/`).catch((err) => {
    dialog.showErrorBox(APP_TITLE, `加载 NX9 页面失败：${String(err)}`);
  });
}

function killServer(): void {
  if (serverProcess && !serverExited) {
    try {
      serverProcess.kill();
    } catch {
      /* 忽略重复退出 */
    }
  }
}

// ---------- IPC：与 apps/web/src/platform/runtime-bridge.ts 的 DesktopBridge 对齐 ----------
ipcMain.handle('nx9:open-external', async (_event, url: string) => {
  await shell.openExternal(String(url));
});

ipcMain.handle('nx9:open-path', async (_event, target: string) => {
  const result = await shell.openPath(String(target));
  return result; // 空字符串表示成功
});

// ---------- 生命周期 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    dataDir = resolveDataDir();
    seedRuntimeAssets();
    let port: number;
    try {
      port = await pickFreePort();
    } catch (err) {
      dialog.showErrorBox(APP_TITLE, `无法分配本地端口：${String(err)}`);
      app.exit(1);
      return;
    }

    // 窗口先行：立即显示品牌启动屏，服务端在后台并行就绪
    const win = createWindow();
    startServer(port);
    writeServerLog(`\n[NX9] window+splash shown at ${Date.now() - tBootStart}ms (port=${port})\n`);

    // 记录运行时信息（调试 / 外部验证用）
    try {
      writeFileSync(
        join(dataDir, 'runtime.json'),
        JSON.stringify({ port, pid: process.pid, startedAt: Date.now() }, null, 2),
      );
    } catch {
      /* 非致命 */
    }

    const ready = await waitForServerReady(port);
    if (!ready) {
      dialog.showErrorBox(
        APP_TITLE,
        `NX9 服务端未在 ${SERVER_READY_TIMEOUT_MS / 1000}s 内就绪。\n日志：${join(dataDir, 'nx9-server.log')}`,
      );
      app.exit(1);
      return;
    }
    writeServerLog(`\n[NX9] server ready at ${Date.now() - tBootStart}ms\n`);

    try {
      writeFileSync(
        join(dataDir, 'runtime.json'),
        JSON.stringify({ port, pid: process.pid, startedAt: Date.now(), ready: true }, null, 2),
      );
    } catch {
      /* 非致命 */
    }

    loadAppInto(win, port);
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    killServer();
  });

  app.on('will-quit', () => {
    killServer();
  });

  process.on('exit', () => {
    killServer();
  });
}
