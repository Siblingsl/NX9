import { create } from 'zustand';

export interface ConfirmDialogOptionField {
  label: string;
  defaultChecked?: boolean;
}

export interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 默认 danger（删除类操作） */
  tone?: 'danger' | 'neutral';
  /** 底部可选勾选（如「存入草稿」） */
  option?: ConfirmDialogOptionField;
}

export interface ConfirmWithOptionResult {
  confirmed: boolean;
  optionChecked: boolean;
}

interface PendingConfirm extends ConfirmDialogOptions {
  resolve: (result: ConfirmWithOptionResult) => void;
  optionChecked: boolean;
}

interface ConfirmDialogState {
  pending: PendingConfirm | null;
  ask: (opts: ConfirmDialogOptions) => Promise<ConfirmWithOptionResult>;
  setOptionChecked: (checked: boolean) => void;
  resolve: (ok: boolean) => void;
}

export const useConfirmDialog = create<ConfirmDialogState>((set, get) => ({
  pending: null,

  ask: (opts) =>
    new Promise<ConfirmWithOptionResult>((resolve) => {
      const prev = get().pending;
      if (prev) prev.resolve({ confirmed: false, optionChecked: false });
      set({
        pending: {
          ...opts,
          optionChecked: opts.option?.defaultChecked ?? false,
          resolve,
        },
      });
    }),

  setOptionChecked: (checked) => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: { ...pending, optionChecked: checked } });
  },

  resolve: (ok) => {
    const pending = get().pending;
    if (!pending) return;
    const optionChecked = pending.optionChecked;
    set({ pending: null });
    pending.resolve({ confirmed: ok, optionChecked });
  },
}));

/** 全局统一删除确认（危险操作默认文案） */
export async function confirmDelete(opts: ConfirmDialogOptions): Promise<boolean> {
  const r = await useConfirmDialog.getState().ask({
    confirmLabel: '确认删除',
    cancelLabel: '取消',
    tone: 'danger',
    ...opts,
  });
  return r.confirmed;
}

/** 通用确认（非删除也可复用同一弹层） */
export async function askConfirm(opts: ConfirmDialogOptions): Promise<boolean> {
  const r = await useConfirmDialog.getState().ask({
    confirmLabel: '确认',
    cancelLabel: '取消',
    tone: 'neutral',
    ...opts,
  });
  return r.confirmed;
}

/** 带底部勾选项的确认（返回是否确认 + 勾选状态） */
export function askConfirmWithOption(
  opts: ConfirmDialogOptions & { option: ConfirmDialogOptionField },
): Promise<ConfirmWithOptionResult> {
  return useConfirmDialog.getState().ask({
    confirmLabel: '确认',
    cancelLabel: '取消',
    tone: 'danger',
    ...opts,
  });
}
