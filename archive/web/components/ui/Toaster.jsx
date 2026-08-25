'use client';

import clsx from 'clsx';
import { useUiStore } from '../../lib/store.js';

const TONES = {
  success: { ring: 'ring-healthy/30', bar: 'bg-healthy', icon: '✓' },
  error: { ring: 'ring-loss/30', bar: 'bg-loss', icon: '!' },
  warn: { ring: 'ring-warn/30', bar: 'bg-warn', icon: '⚠' },
  info: { ring: 'ring-brand/30', bar: 'bg-brand', icon: 'i' },
};

/**
 * Toasts carry the detail, not just the headline: a rejected save lists the
 * offending fields so the operator knows what to change. Errors stay until
 * dismissed.
 */
export default function Toaster() {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => {
        const tone = TONES[toast.tone] ?? TONES.info;
        return (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto flex gap-3 overflow-hidden rounded-lg bg-surface-raised p-3 shadow-pop ring-1',
              tone.ring,
              'animate-slide-up',
            )}
          >
            <span className={clsx('w-0.5 shrink-0 self-stretch rounded-full', tone.bar)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink">{toast.title}</p>

              {Array.isArray(toast.details) && toast.details.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {toast.details.slice(0, 6).map((detail, index) => (
                    <li key={index} className="text-2xs text-ink-muted">
                      {detail.path && <span className="font-mono text-ink-faint">{detail.path}</span>}
                      {detail.path && ' — '}
                      {detail.message}
                    </li>
                  ))}
                  {toast.details.length > 6 && (
                    <li className="text-2xs text-ink-faint">+{toast.details.length - 6} more</li>
                  )}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="shrink-0 self-start rounded p-0.5 text-ink-faint hover:bg-surface-hover hover:text-ink"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
