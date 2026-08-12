/** @type {import('next').NextConfig} */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,

  /**
   * The storefront talks to the backend over HTTP only — it never touches
   * MongoDB. Proxying the API and the product photos through Next keeps every
   * browser request same-origin, so there is no CORS surface and no API origin
   * baked into the client bundle.
   */
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${API_ORIGIN}/api/v1/:path*` },
      { source: '/Catalog/:path*', destination: `${API_ORIGIN}/Catalog/:path*` },
    ];
  },
};

export default nextConfig;
