/** Desktop runtime bridge — Electron hooks land here later without touching UI code */

export type RuntimeKind = 'web' | 'desktop';

export interface DesktopBridge {
  kind: 'desktop';
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<void>;
  dragAssetOut(payload: { url: string; filename: string }): Promise<void>;
  /** Optional Voicebox sidecar URL when running in Electron */
  voiceboxBaseUrl?: string;
  luxTtsBaseUrl?: string;
}

export interface WebBridge {
  kind: 'web';
  openExternal(url: string): Promise<void>;
  openPath(_path: string): Promise<void>;
  dragAssetOut(_payload: { url: string; filename: string }): Promise<void>;
  voiceboxBaseUrl?: string;
  luxTtsBaseUrl?: string;
}

export type RuntimeBridge = DesktopBridge | WebBridge;

const webBridge: WebBridge = {
  kind: 'web',
  voiceboxBaseUrl: 'http://127.0.0.1:17493',
  luxTtsBaseUrl: 'http://127.0.0.1:17880',
  async openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  async openPath() {
    console.info('[NX9] openPath is only available in desktop runtime');
  },
  async dragAssetOut() {
    console.info('[NX9] dragAssetOut is only available in desktop runtime');
  },
};

declare global {
  interface Window {
    nx9Desktop?: DesktopBridge;
  }
}

export function getRuntime(): RuntimeBridge {
  return window.nx9Desktop ?? webBridge;
}

export function isDesktop(): boolean {
  return getRuntime().kind === 'desktop';
}
