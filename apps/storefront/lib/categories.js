/**
 * The four categories the shop leads with on the home page.
 *
 * `name` must match the backend taxonomy exactly — it is sent straight back as
 * a `category` filter, so a mismatch here silently produces an empty grid.
 * Everything else the catalog holds is still reachable from the listing page's
 * filters, which are built from live facet counts rather than this list.
 */
export const FEATURED_CATEGORIES = [
  {
    name: 'Chargers',
    blurb: 'Wall, car and wireless — GaN, PD and Qi2.',
    accent: 'from-amber-50 via-orange-50 to-white',
    icon: 'bolt',
  },
  {
    name: 'Cables',
    blurb: 'USB-C, Lightning, HDMI and display cables.',
    accent: 'from-sky-50 via-blue-50 to-white',
    icon: 'cable',
  },
  {
    name: 'Power Banks',
    blurb: 'Pocket 10K to 200W magnetic and retractable.',
    accent: 'from-emerald-50 via-teal-50 to-white',
    icon: 'battery',
  },
  {
    name: 'Audio',
    blurb: 'True wireless earbuds, headphones and speakers.',
    accent: 'from-violet-50 via-purple-50 to-white',
    icon: 'audio',
  },
];

export default FEATURED_CATEGORIES;
