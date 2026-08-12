/**
 * Inline SVG icon set.
 *
 * Inline rather than an icon package: the storefront needs a dozen glyphs, and
 * shipping an icon library for that costs more download than the entire rest of
 * the page. Every icon inherits `currentColor` and sizes from the font.
 */
const PATHS = {
  search: <path d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />,
  close: <path d="M18 6L6 18M6 6l12 12" />,
  chevronRight: <path d="M9 18l6-6-6-6" />,
  chevronLeft: <path d="M15 18l-6-6 6-6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  bolt: <path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />,
  cable: (
    <path d="M4 4v5a4 4 0 004 4h1a4 4 0 014 4v3M8 2v4M4 4h8M16 22v-5a4 4 0 00-4-4" />
  ),
  battery: (
    <>
      <rect x="2" y="7" width="16" height="10" rx="2.5" />
      <path d="M21 10.5v3M11 10l-2 2.5h2.5L9.5 15" />
    </>
  ),
  audio: <path d="M3 14v-3a9 9 0 0118 0v3M3 14a3 3 0 003 3h1v-6H6a3 3 0 00-3 3zm18 0a3 3 0 01-3 3h-1v-6h1a3 3 0 013 3z" />,
  box: (
    <path d="M21 8l-9-5-9 5m18 0v8l-9 5-9-5V8m18 0l-9 5-9-5" />
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  whatsapp: (
    <path d="M21 11.5a8.5 8.5 0 01-12.6 7.4L3 21l2.2-5.2A8.5 8.5 0 1121 11.5z" />
  ),
  phone: (
    <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" />
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 6L2 7" />
    </>
  ),
  pin: (
    <>
      <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v5M12 16.5v.01" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
};

export default function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.75, ...rest }) {
  const path = PATHS[name];
  if (!path) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path}
    </svg>
  );
}
