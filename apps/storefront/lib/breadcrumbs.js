/**
 * The trail shown above a product.
 *
 * One definition, used by both the visible `<nav>` and the `BreadcrumbList`
 * structured data. Google requires the markup to describe the breadcrumb the
 * customer can actually see, and two hand-maintained copies drift apart the
 * first time a category link changes shape.
 */
export function productTrail(product) {
  return [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products' },
    product?.category
      ? {
          label: product.category,
          href: `/products?category=${encodeURIComponent(product.category)}`,
        }
      : null,
  ].filter(Boolean);
}

export default { productTrail };
