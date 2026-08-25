import Link from 'next/link';
import EmptyState from '../../../components/ui/EmptyState.jsx';

export const metadata = {
  title: 'Product not available',
  // A URL that names no product must not stay in the index.
  robots: { index: false, follow: true },
};

/**
 * Boundary for a product that does not exist or is not published.
 *
 * Scoped to this segment rather than relying on the root one: a `notFound()`
 * raised inside a statically-generated route needs a boundary in its own
 * segment, otherwise the response is an empty body with a 200 — a soft 404,
 * which is precisely what gets junk URLs indexed as real pages.
 */
export default function ProductNotFound() {
  return (
    <div className="container-page py-20">
      <EmptyState
        icon="box"
        title="Product not available"
        message="This product is no longer listed, or it has not been published to the shop yet."
        action={
          <div className="flex flex-wrap justify-center gap-2.5">
            <Link href="/products" className="btn-primary">
              Browse all products
            </Link>
            <Link href="/" className="btn-ghost">
              Back to the shop
            </Link>
          </div>
        }
      />
    </div>
  );
}
