/** @type {import('next').NextConfig} */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';

/**
 * Security headers.
 *
 * No CSP here: the app inlines JSON-LD and Next injects its own bootstrap
 * scripts, so a meaningful policy needs nonces wired through the whole render
 * path. These are the headers that are correct unconditionally — a partial CSP
 * that has to be loosened until it passes is worse than none.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    // The shop needs none of these; denying them removes the prompt entirely.
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Emits a self-contained server with only the modules actually imported,
  // which is what the runtime Docker stage copies. Keeps the image small and
  // means no `npm install` in the final layer.
  output: 'standalone',

  // Trailing slashes would give every page two indexable URLs.
  trailingSlash: false,

  compress: true,

  images: {
    // Catalog photos are unoptimised source files — some are over 1 MB. Next
    // re-encodes them to AVIF/WebP at the size actually requested, which is the
    // difference between a usable shop and an unusable one on mobile data.
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 480, 640, 828, 1080, 1280, 1920],
    imageSizes: [64, 96, 128, 200, 256, 384],
    minimumCacheTTL: 86_400,
  },

  /**
   * The storefront talks to the backend over HTTP only — it never touches
   * MongoDB. Proxying the API and the product photos through Next keeps every
   * browser request same-origin, so there is no CORS surface and no API origin
   * baked into the client bundle.
   */
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${API_ORIGIN}/api/v1/:path*` },
      { source: '/catalog/:path*', destination: `${API_ORIGIN}/catalog/:path*` },
    ];
  },

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Product photos are immutable: a changed photo is a different file.
        source: '/catalog/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, immutable' }],
      },
    ];
  },
};

export default nextConfig;
