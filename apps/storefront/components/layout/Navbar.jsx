'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { FEATURED_CATEGORIES } from '../../lib/categories.js';
import SearchBox from '../search/SearchBox.jsx';
import Icon from '../ui/Icon.jsx';
import Logo from './Logo.jsx';

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // A route change must close the mobile sheet, or tapping a category leaves
  // the overlay covering the page it just navigated to.
  useEffect(() => setMenuOpen(false), [pathname]);

  // The bar is transparent over the dark hero and gains a surface once the
  // page scrolls under it, so it never floats over product photography.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The sheet is a full-screen overlay; letting the page behind it scroll is
  // the classic mobile-menu bug.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const links = [
    { href: '/products', label: 'All products' },
    ...FEATURED_CATEGORIES.map((category) => ({
      href: `/products?category=${encodeURIComponent(category.name)}`,
      label: category.name,
    })),
  ];

  return (
    <header
      className={clsx(
        'sticky top-0 z-40 transition-all duration-300',
        scrolled ? 'border-b border-line bg-white/85 backdrop-blur-xl' : 'border-b border-transparent bg-white',
      )}
    >
      <div className="container-page">
        <div className="flex h-[4.5rem] items-center gap-4">
          <Link href="/" className="shrink-0" aria-label="ByteHub home">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Categories">
            {links.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-full px-3.5 py-2 text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden w-full max-w-sm md:block">
            <SearchBox />
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="ml-auto rounded-full border border-line p-2 text-ink lg:hidden"
          >
            <Icon name={menuOpen ? 'close' : 'filter'} className="h-5 w-5" />
          </button>
        </div>

        {/* Search moves below the bar on phones, where it cannot share a row. */}
        <div className="pb-3 md:hidden">
          <SearchBox />
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-[env(safe-area-inset-top)] z-50 overflow-y-auto bg-white lg:hidden">
          <div className="container-page flex h-16 items-center justify-between border-b border-line">
            <Logo />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="rounded-full border border-line p-2"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>

          <nav className="container-page py-4" aria-label="Categories">
            {links.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className={clsx(
                  'flex items-center justify-between border-b border-line py-3.5 text-base',
                  'text-ink transition-colors hover:text-accent',
                )}
              >
                {link.label}
                <Icon name="chevronRight" className="h-4 w-4 text-ink-faint" />
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
