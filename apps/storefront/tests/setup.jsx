import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// next/image needs a real loader; in jsdom it is enough that it renders an
// <img> with the src we gave it.
vi.mock('next/image', () => ({
  default: ({ src, alt, className, onError, priority, ...rest }) => {
    const props = { src, alt, className, onError, ...rest };
    delete props.fill;
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} data-priority={priority ? 'true' : undefined} />;
  },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});
