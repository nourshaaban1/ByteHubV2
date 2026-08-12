import './globals.css';
import Providers from './providers.jsx';
import Shell from '../components/layout/Shell.jsx';
import Toaster from '../components/ui/Toaster.jsx';

export const metadata = {
  title: 'ByteHub — Catalog Control',
  description: 'Decide what to buy, what to fix, and what sells profitably.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Shell>{children}</Shell>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
