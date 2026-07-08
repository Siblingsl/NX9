import { create } from 'zustand';

export type ToastVariant = 'info' | 'error' | 'success';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  items: ToastItem[];
  push: (item: Omit<ToastItem, 'id'> & { id?: string }) => string;
  dismiss: (id: string) => void;
}

export const useToast = create<ToastState>((set) => ({
  items: [],

  push: (item) => {
    const id = item.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({
      items: [...s.items.filter((t) => t.id !== id), { ...item, id }],
    }));
    return id;
  },

  dismiss: (id) => {
    set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
  },
}));

/** 固定 id，避免重复堆叠同类错误 */
export function toastError(message: string, action?: { label: string; onClick: () => void }) {
  return useToast.getState().push({
    id: 'workspace-save-error',
    message,
    variant: 'error',
    actionLabel: action?.label,
    onAction: action?.onClick,
  });
}

export function toastSuccess(message: string) {
  return useToast.getState().push({ message, variant: 'success' });
}
