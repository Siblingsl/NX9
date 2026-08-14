/**
 * NX9 Studio — preload 脚本。
 *
 * 通过 contextBridge 注入 window.nx9Desktop，与
 * apps/web/src/platform/runtime-bridge.ts 的 DesktopBridge 接口对齐：
 *   kind / openExternal / openPath / dragAssetOut / voiceboxBaseUrl / luxTtsBaseUrl
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nx9Desktop', {
  kind: 'desktop',
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('nx9:open-external', url),
  openPath: (target: string): Promise<void> => ipcRenderer.invoke('nx9:open-path', target),
  // 前端暂未消费该能力；预留 IPC 通道，后续可扩展为 startDrag 原生拖拽
  dragAssetOut: async (): Promise<void> => {
    console.info('[NX9] dragAssetOut is reserved; not implemented yet');
  },
  voiceboxBaseUrl: undefined,
  luxTtsBaseUrl: undefined,
});
