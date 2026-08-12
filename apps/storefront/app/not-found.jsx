import Link from 'next/link';
import EmptyState from '../components/ui/EmptyState.jsx';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="container-page py-20">
      <EmptyState
        icon="search"
        title="Page not found"
        message="The page you're looking for doesn't exist or has moved."
        action={
          <Link href="/" className="btn-primary">
            Back to the shop
          </Link>
        }
      />
    </div>
  );
}
