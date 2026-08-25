import Hero, { SHELF_QUERY } from '../components/home/Hero.jsx';
import CategorySection from '../components/home/CategorySection.jsx';
import FeaturedSection from '../components/home/FeaturedSection.jsx';
import { fetchFacets, fetchProducts, REVALIDATE } from '../lib/server-api.js';

export const revalidate = REVALIDATE.catalog;

export const metadata = {
  description:
    'Browse chargers, cables, power banks and audio gear at ByteHub Egypt. Compare specs and prices, then message us to buy.',
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
};

const FEATURED_LIMIT = 8;

/**
 * The catalog is read here, on the server, and handed to the sections below.
 *
 * They are client components because the counts and the shelf stay live, but a
 * client component with nothing to render still produces empty HTML — which is
 * what a crawler, a link preview bot and a browser with no JavaScript all see.
 * Fetching here means the home page ships with its product names, prices and
 * links already in it, and the queries refresh them afterwards.
 */
export default async function HomePage() {
  const [facets, shelf, featured] = await Promise.all([
    fetchFacets(),
    fetchProducts(SHELF_QUERY),
    fetchProducts({ limit: FEATURED_LIMIT }),
  ]);

  // An empty result means the catalog was unreachable, not that the shop has
  // nothing. Seeding the query with it would pin an empty grid until the
  // client refetch lands; leaving it unset lets the section show its loading
  // state instead.
  const seed = (result) => (result.items.length > 0 ? result : undefined);

  return (
    <>
      <Hero initialFacets={facets} initialShelf={seed(shelf)} />
      <CategorySection initialFacets={facets} />
      <FeaturedSection
        eyebrow="Picked for you"
        title="Featured products"
        subtitle="Hand-checked stock, priced in Egyptian pounds."
        limit={FEATURED_LIMIT}
        initialProducts={seed(featured)}
      />
    </>
  );
}
