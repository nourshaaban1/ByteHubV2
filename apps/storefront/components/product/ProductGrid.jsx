import ProductCard from './ProductCard.jsx';

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="aspect-square skeleton rounded-none" />
      <div className="space-y-2.5 border-t border-line p-4">
        <div className="skeleton h-2.5 w-1/3" />
        <div className="skeleton h-3.5 w-full" />
        <div className="skeleton h-3.5 w-2/3" />
        <div className="skeleton h-4 w-1/2" />
      </div>
    </div>
  );
}

export default function ProductGrid({ products = [], loading, skeletonCount = 8 }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
      {loading
        ? Array.from({ length: skeletonCount }, (_, index) => <CardSkeleton key={index} />)
        : products.map((product, index) => (
            // The first row is above the fold on every breakpoint, so those
            // images load eagerly and the rest stay lazy.
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
    </div>
  );
}
