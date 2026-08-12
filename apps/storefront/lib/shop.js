/**
 * Shop identity and contact details.
 *
 * ByteHub sells offline: the storefront's job is to get a customer to the point
 * of knowing what they want, then hand them to a human. There is no cart and no
 * checkout, so "Contact to buy" is the conversion point.
 */
export const shop = {
  name: 'ByteHub',
  tagline: 'Chargers, cables, power banks and audio — sourced and checked in Egypt.',

  // Digits only, international format. WhatsApp rejects '+' and spaces in wa.me.
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP ?? '201044100855',
  phone: process.env.NEXT_PUBLIC_PHONE ?? '+20 10 4410 0855',
  email: process.env.NEXT_PUBLIC_EMAIL ?? 'hello@bytehub.eg',
  address: process.env.NEXT_PUBLIC_ADDRESS ?? 'Cairo, Egypt',
};

/**
 * A WhatsApp deep link that opens with the product already described.
 *
 * The SKU is included because it is what the shop searches on — "the black
 * 65W one" costs a round trip that "S-A60" does not.
 */
export function whatsappLink(product) {
  const lines = product
    ? [
        `Hi ByteHub, I'd like to ask about:`,
        product.name,
        product.sku ? `SKU: ${product.sku}` : null,
      ].filter(Boolean)
    : [`Hi ByteHub, I'd like to ask about a product.`];

  return `https://wa.me/${shop.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export default shop;
