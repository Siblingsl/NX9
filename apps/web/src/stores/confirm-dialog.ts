import { create } from 'zustand';

export interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 默认 danger（删除类操作） */
  tone?: 'danger' | 'neutral';
}

interface PendingConfirm extends ConfirmDialogOptions {
  resolve: (ok: boolean) => void;
}

interface ConfirmDialogState {
  pending: PendingConfirm | null;
  ask: (opts: ConfirmDialogOptions) => Promise<boolean>;
  resolve: (ok: boolean) => void;
}

export const useConfirmDialog = create<ConfirmDialogState>((set, get) => ({
  pending: null,

  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      const prev = get().pending;
      if (prev) prev.resolve(false);
      set({ pending: { ...opts, resolve } });
    }),

  resolve: (ok) => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null });
    pending.resolve(ok);
  },
}));

/** 全局统一删除确认（危险操作默认文案） */
export function confirmDelete(opts: ConfirmDialogOptions): Promise<boolean> {
  return useConfirmDialog.getState().ask({
    confirmLabel: '确认删除',
    cancelLabel: '取消',
    tone: 'danger',
    ...opts,
  });
}

/** 通用确认（非删除也可复用同一弹层） */
export function askConfirm(opts: ConfirmDialogOptions): Promise<boolean> {
  return useConfirmDialog.getState().ask({
    confirmLabel: '确认',
    cancelLabel: '取消',
    tone: 'neutral',
    ...opts,
  });
}
