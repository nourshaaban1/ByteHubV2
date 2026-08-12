import Hero from '../components/home/Hero.jsx';
import CategorySection from '../components/home/CategorySection.jsx';
import FeaturedSection from '../components/home/FeaturedSection.jsx';

export const metadata = {
  description:
    'Browse chargers, cables, power banks and audio gear at ByteHub Egypt. Compare specs and prices, then message us to buy.',
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <CategorySection />
      <FeaturedSection
        eyebrow="Picked for you"
        title="Featured products"
        subtitle="Hand-checked stock, priced in Egyptian pounds."
        limit={8}
      />
    </>
  );
}
