/** @type {import('next').NextConfig} */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,

  /**
   * Proxy the API and the catalog images through Next in development, so the
   * browser makes same-origin requests and there is no CORS surface at all.
   */
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${API_ORIGIN}/api/v1/:path*` },
      { source: '/Catalog/:path*', destination: `${API_ORIGIN}/Catalog/:path*` },
      { source: '/health', destination: `${API_ORIGIN}/health` },
    ];
  },
};

export default nextConfig;
