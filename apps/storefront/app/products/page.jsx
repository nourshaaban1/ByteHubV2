import { Suspense } from 'react';
import CatalogView from '../../components/catalog/CatalogView.jsx';

export const metadata = {
  title: 'All products',
  description:
    'Browse the full ByteHub catalog — chargers, cables, power banks, audio and more, with prices in Egyptian pounds.',
};

function CatalogFallback() {
  return (
    <div className="container-page py-10">
      <div className="skeleton h-8 w-48" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="skeleton aspect-[3/4] w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  // CatalogView reads the query string with useSearchParams, which opts the
  // subtree into client-side rendering and needs a Suspense boundary above it.
  return (
    <Suspense fallback={<CatalogFallback />}>
      <CatalogView />
    </Suspense>
  );
}
