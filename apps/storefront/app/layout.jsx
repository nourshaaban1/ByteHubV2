import { Inter } from 'next/font/google';
import { shop } from '../lib/shop.js';
import Providers from './providers.jsx';
import Navbar from '../components/layout/Navbar.jsx';
import Footer from '../components/layout/Footer.jsx';
import StoreJsonLd from '../components/seo/StoreJsonLd.jsx';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export const metadata = {
  // Without metadataBase every Open Graph image resolves relative and breaks
  // the moment a link is shared anywhere off-site.
  metadataBase: new URL(siteUrl),
  title: {
    default: `${shop.name} — ${shop.tagline}`,
    template: `%s · ${shop.name}`,
  },
  description: shop.tagline,
  applicationName: shop.name,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: shop.name,
    locale: 'en_EG',
    url: '/',
    title: `${shop.name} — ${shop.tagline}`,
    description: shop.tagline,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  formatDetection: { telephone: true, address: false, email: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <StoreJsonLd />
        <Providers>
          <Navbar />
          <main id="main" className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
