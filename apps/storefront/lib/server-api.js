import 'server-only';

/**
 * Server-side catalog reads, used for page metadata.
 *
 * The browser reaches the API through Next's rewrite proxy, but a rewrite is a
 * client-request concern — code running on the server has to address the
 * backend directly. Same HTTP contract, same public endpoint, no database
 * access: this is still a frontend talking to an API.
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';

export async function fetchProduct(id) {
  try {
    const response = await fetch(`${API_ORIGIN}/api/v1/products/public/${id}`, {
      // Catalog copy changes when the shop edits a product, not per request.
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.data ?? null;
  } catch {
    // Metadata must never be the reason a page fails to render — the client
    // component below fetches the same product and shows a real error state.
    return null;
  }
}

export default { fetchProduct };
