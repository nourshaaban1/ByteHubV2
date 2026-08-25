import { notFound } from 'next/navigation';
import ProductDetail from '../../../components/product/ProductDetail.jsx';
import ProductJsonLd from '../../../components/seo/ProductJsonLd.jsx';
import {
  fetchProduct,
  fetchRelated,
  fetchSitemapEntries,
  REVALIDATE,
} from '../../../lib/server-api.js';
import { formatPrice } from '../../../lib/format.js';
import { shop } from '../../../lib/shop.js';

/**
 * Product pages are rendered on the server and cached.
 *
 * The catalog is small and changes when the shop reimports, not per request,
 * so every product page is generated at build time and revalidated on a timer.
 * A customer on a slow connection gets HTML with the price already in it, and
 * a crawler gets the whole page without executing JavaScript.
 */
export const revalidate = REVALIDATE.product;

/**
 * Only the slugs listed by `generateStaticParams` exist.
 *
 * With this on, an unknown slug is rendered on demand and its `notFound()`
 * result gets cached and served as a 200 — a soft 404, which is how a shop
 * ends up with unlimited junk URLs indexed as real pages. Off, the router
 * answers 404 without running the page at all.
 *
 * The cost is that a newly published product needs a rebuild to become
 * reachable. That is already true for the sitemap, and publishing is a
 * deliberate CLI step, so it costs nothing in practice.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  const entries = await fetchSitemapEntries();

  /**
   * A build that reaches no catalog produces a shop with no product pages, and
   * because `dynamicParams` is off every product URL would then 404. That is
   * silent: the build succeeds, the home page renders, and only the products
   * are missing. In a container build, where an unreachable API is the likely
   * failure, fail loudly instead.
   *
   * Left off for local builds, where building without a running API is normal.
   */
  if (entries.length === 0 && process.env.REQUIRE_CATALOG === '1') {
    throw new Error(
      'No published products were reachable at build time, so no product pages ' +
        'would exist. Check that the catalog API is up and that the catalog has ' +
        'been imported and published.',
    );
  }

  return entries.map((entry) => ({ handle: entry.slug }));
}

export async function generateMetadata({ params }) {
  const product = await fetchProduct(params.handle);

  if (!product) {
    return { title: 'Product not available', robots: { index: false, follow: true } };
  }

  const price = formatPrice(product.price);
  const description =
    product.description?.short ??
    [product.brand, product.category, price].filter(Boolean).join(' · ');

  const canonical = `/products/${product.slug ?? params.handle}`;

  return {
    title: product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: shop.name,
      title: product.name,
      description,
      url: canonical,
      images: product.image ? [{ url: product.image, alt: product.name }] : undefined,
    },
    twitter: {
      card: product.image ? 'summary_large_image' : 'summary',
      title: product.name,
      description,
    },
  };
}

export default async function ProductPage({ params }) {
  const product = await fetchProduct(params.handle);

  // A missing or unpublished product is a real 404, not an empty page — it
  // keeps the URL out of the index instead of ranking a blank result.
  if (!product) notFound();

  const related = await fetchRelated(product);

  return (
    <>
      <ProductJsonLd product={product} />
      <ProductDetail product={product} related={related} />
    </>
  );
}
