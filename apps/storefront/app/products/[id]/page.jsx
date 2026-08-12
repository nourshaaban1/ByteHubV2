import ProductDetail from '../../../components/product/ProductDetail.jsx';
import { fetchProduct } from '../../../lib/server-api.js';
import { formatPrice } from '../../../lib/format.js';

/**
 * Metadata is resolved on the server so a shared link previews with the real
 * product name and price. The page body still fetches client-side through
 * React Query, which keeps the cache shared with the grid the customer
 * arrived from.
 */
export async function generateMetadata({ params }) {
  const product = await fetchProduct(params.id);
  if (!product) return { title: 'Product not available' };

  const price = formatPrice(product.price);
  const description =
    product.description?.short ??
    [product.brand, product.category, price].filter(Boolean).join(' · ');

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      images: product.image ? [{ url: product.image }] : undefined,
    },
  };
}

export default function ProductPage({ params }) {
  return <ProductDetail id={params.id} />;
}
