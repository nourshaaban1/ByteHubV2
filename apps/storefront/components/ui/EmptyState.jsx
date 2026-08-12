import Icon from './Icon.jsx';

/**
 * The "nothing here" panel.
 *
 * Deliberately distinguishes "your filters matched nothing" from "the shop has
 * published nothing yet" — they look identical to a customer but mean opposite
 * things, and only one of them is fixed by clearing filters.
 */
export default function EmptyState({ icon = 'box', title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-canvas text-ink-faint">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {message ? <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{message}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
