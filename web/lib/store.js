'use client';

import { create } from 'zustand';

let toastId = 0;

/**
 * Cross-page UI state only. Server state lives in React Query; putting it here
 * as well would create two sources of truth that drift apart.
 */
export const useUiStore = create((set, get) => ({
  /* ------------------------------ toasts ------------------------------ */
  toasts: [],

  pushToast: (toast) => {
    const id = (toastId += 1);
    const entry = { id, tone: 'info', ...toast };
    set((state) => ({ toasts: [...state.toasts, entry] }));

    // Errors persist until dismissed: an operator must not miss a failed save.
    if (entry.tone !== 'error') {
      setTimeout(() => get().dismissToast(id), entry.tone === 'warn' ? 8000 : 4000);
    }
    return id;
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),

  /* -------------------- fix-queue selection (bulk) -------------------- */
  selected: {},

  toggleSelected: (id) =>
    set((state) => {
      const next = { ...state.selected };
      if (next[id]) delete next[id];
      else next[id] = true;
      return { selected: next };
    }),

  selectMany: (ids) =>
    set((state) => ({
      selected: { ...state.selected, ...Object.fromEntries(ids.map((id) => [id, true])) },
    })),

  clearSelection: () => set({ selected: {} }),

  /* ------------------------- detail drawer --------------------------- */
  drawerProductId: null,
  openProduct: (id) => set({ drawerProductId: id }),
  closeProduct: () => set({ drawerProductId: null }),
}));

export const useSelectedIds = () => {
  const selected = useUiStore((state) => state.selected);
  return Object.keys(selected);
};

/** Convenience wrapper so components call `toast.success(...)`. */
export function useToast() {
  const push = useUiStore((state) => state.pushToast);
  return {
    success: (title, details) => push({ tone: 'success', title, details }),
    error: (title, details) => push({ tone: 'error', title, details }),
    warn: (title, details) => push({ tone: 'warn', title, details }),
    info: (title, details) => push({ tone: 'info', title, details }),
  };
}
