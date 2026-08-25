/** A product shaped exactly like the public API's detail payload. */
export const makeProduct = (overrides = {}) => ({
  id: '6a720620267f7e4b8ba9244f',
  slug: 'joyroom-jr-tcg13-gan-wall-charger-45w-usb-c',
  name: 'Joyroom JR-TCG13 GaN Wall Charger — 45W USB-C',
  brand: 'Joyroom',
  sku: 'JR-TCG13',
  category: 'Chargers',
  subcategory: 'Wall Chargers',
  category_path: ['Chargers', 'Wall Chargers'],
  price: { amount: 750, currency: 'EGP', is_estimated: false },
  image: '/catalog/Chargers/Joyroom%2045W%20GaN%20USB-C%20Charger/a.jpg',
  images: [{ url: '/catalog/Chargers/Joyroom%2045W%20GaN%20USB-C%20Charger/a.jpg', is_primary: true }],
  availability: { in_stock: true },
  description: {
    short: 'GaN wall charger with a single USB-C port, 45W.',
    long: 'Joyroom JR-TCG13 uses gallium nitride to fit 45W of USB-C Power Delivery into a small plug.',
  },
  specs: {
    power_wattage: 45,
    condition: 'New',
    compatibility: ['USB-C phones and tablets'],
    features: ['GaN', 'USB-C Power Delivery'],
  },
  tags: [],
  ...overrides,
});
