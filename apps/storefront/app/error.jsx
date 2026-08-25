'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import EmptyState from '../components/ui/EmptyState.jsx';

/**
 * Last-resort boundary for an unhandled render error.
 *
 * A shop showing a blank white page reads as broken and permanently lost.
 * This keeps the header, the footer and a way back into the catalog.
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('storefront error:', error);
  }, [error]);

  return (
    <div className="container-page py-20">
      <EmptyState
        icon="alert"
        title="Something went wrong"
        message="We couldn't load this page. It is usually temporary — try again, or browse the catalog."
        action={
          <div className="flex flex-wrap justify-center gap-2.5">
            <button type="button" onClick={reset} className="btn-primary">
              Try again
            </button>
            <Link href="/products" className="btn-ghost">
              Browse all products
            </Link>
          </div>
        }
      />
    </div>
  );
}
