import { Suspense } from 'react';
import CatalogView from '../../components/catalog/CatalogView.jsx';
import { queryFrom, readFilters } from '../../lib/catalog-query.js';
import { fetchProducts, REVALIDATE } from '../../lib/server-api.js';

export const revalidate = REVALIDATE.catalog;

/**
 * Only `category` changes what this page is about.
 *
 * `sort`, `page` and `brand` reorder or narrow the same set, which is why
 * robots.txt excludes them — they are the same products at another URL. A
 * single category is a page worth indexing and gets its own canonical; a
 * combination like "Cables,Audio" is a filter the customer built, and folds
 * back onto the plain catalog.
 */
const categoryOf = (searchParams) => {
  const raw = searchParams?.category;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value && !value.includes(',') ? value : null;
};

export async function generateMetadata({ searchParams }) {
  const category = categoryOf(searchParams);

  const canonical = category ? `/products?category=${encodeURIComponent(category)}` : '/products';
  const title = category ?? 'All products';
  const description = category
    ? `${category} at ByteHub Egypt — specs, photos and prices in Egyptian pounds. Message us to buy.`
    : 'Browse the full ByteHub catalog — chargers, cables, power banks, audio and more, with prices in Egyptian pounds.';

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
  };
}

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

/**
 * The catalog, fetched here and rendered into the HTML.
 *
 * `CatalogView` owns the filtering, so it stays a client component — but a
 * client component still renders on the server, and one with an empty query
 * cache renders skeletons. That left the page a customer reaches from every
 * navbar category, and the one the sitemap advertises, with no products in it
 * for anything that does not run JavaScript.
 *
 * Reading the same filters the hook reads means the fetch below lands under
 * the exact cache key the browser asks for, so hydration continues from this
 * result rather than replacing it.
 */
export default async function ProductsPage({ searchParams }) {
  const query = queryFrom(readFilters(searchParams));
  const products = await fetchProducts(query);

  return (
    <Suspense fallback={<CatalogFallback />}>
      <CatalogView initialProducts={products.items.length > 0 ? products : undefined} />
    </Suspense>
  );
}
