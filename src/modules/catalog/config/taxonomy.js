/**
 * Category taxonomy. Purely declarative: `match` terms are tested against the
 * raw category cell first and the product name second, so rows that carry no
 * category at all (or an Arabic one) still land in the right bucket.
 *
 * Order matters — the first matching subcategory wins, so put the specific
 * ones above the general ones.
 */
export const TAXONOMY = [
  {
    category: 'Cables',
    slug: 'cables',
    match: ['cable', 'cables', 'كابل', 'كابلات', 'wire', 'cord'],
    subcategories: [
      { name: 'Display Cables', match: ['hdmi', 'vga', 'displayport', 'display port', 'dp to dp', 'display cable', 'monitor cable', 'dvi'] },
      { name: 'Internal PC Cables', match: ['sata', 'internal pc cable', 'power laptop', 'molex'] },
      { name: 'Charging Cables', match: ['type-c', 'type c', 'usb-c', 'usb c', 'lightning', 'micro usb', 'charging cable', 'data cable', 'c-c', 'c-l', 'powerline', 'iphone'] },
      { name: 'Multi-Head Cables', match: ['3-in-1', '6-in-1', '3 in 1', '6 in 1', 'multi'] },
    ],
  },
  {
    category: 'Chargers',
    slug: 'chargers',
    match: ['charger', 'chargers', 'شاحن', 'شواحن', 'charging', 'adapter power', 'wall charger'],
    subcategories: [
      { name: 'Wall Chargers', match: ['wall', 'gan', 'pd', 'cube', 'powerport', 'جداري'] },
      { name: 'Car Chargers', match: ['car', 'vehicle', 'سيارة'] },
      { name: 'Wireless Chargers', match: ['wireless', 'magsafe', 'qi', 'magnetic'] },
    ],
  },
  {
    category: 'Power Banks',
    slug: 'power-banks',
    match: ['power bank', 'powerbank', 'باور بانك', 'بور بانك', 'portable charger', 'power banks'],
    subcategories: [
      { name: 'Magnetic Power Banks', match: ['magnetic', 'magsafe', 'maggo'] },
      { name: 'Retractable Power Banks', match: ['retractable', 'built-in cable'] },
      { name: 'High Capacity', match: ['20k', '30k', '20000', '30000', '25000'] },
    ],
  },
  {
    category: 'Audio',
    slug: 'audio',
    // 'earphone' is distinct from 'earbud': matching is whole-token with only a
    // plural suffix allowed, so "wired earphones" matches neither 'earbud' nor
    // 'headphone' and fell through to the raw cell as its own category.
    match: ['earbud', 'earbuds', 'earphone', 'earphones', 'audio', 'سماعات', 'سماعة', 'headphone', 'headphones', 'speaker', 'speakers', 'tws', 'soundcore'],
    subcategories: [
      // Headphones first: 'anc' below is a noise-cancelling feature, not a form
      // factor, and both earbuds and over-ear headphones have it. Matched after
      // 'anc' it made "Q20i ANC over-ear" a pair of True Wireless Earbuds.
      { name: 'Headphones', match: ['over-ear', 'over ear', 'headphone', 'headset'] },
      { name: 'True Wireless Earbuds', match: ['tws', 'true wireless', 'earbud', 'anc'] },
      // Deliberately not matching 'in-ear', which plenty of wireless earbuds
      // also call themselves.
      { name: 'Wired Earphones', match: ['wired', 'earphone'] },
      { name: 'Speakers', match: ['speaker', 'boombox', 'glow'] },
    ],
  },
  {
    category: 'Storage',
    slug: 'storage',
    match: ['ssd', 'storage', 'flash', 'flash memory', 'usb flash', 'hard disk', 'hdd', 'memory card', 'قرص', 'فلاش'],
    subcategories: [
      { name: 'NVMe SSD', match: ['nvme', 'm.2', 'm2 ssd'] },
      { name: 'SATA SSD', match: ['sata ssd', 'internal ssd', '2.5', 'bx500', 'a400', 'sa510', 'cs900'] },
      { name: 'USB Flash Drives', match: ['flash drive', 'usb flash', 'jumpdrive', 'datatraveler', 'cruzer', 'thumb drive'] },
      { name: 'Memory Cards', match: ['sd card', 'microsd', 'micro sd'] },
    ],
  },
  {
    category: 'Memory',
    slug: 'memory',
    match: ['ram', 'memory', 'ذاكرة', 'ddr', 'sodimm', 'dimm'],
    subcategories: [
      { name: 'Laptop RAM', match: ['sodimm', 'laptop', 'ddr3l', 'so-dimm'] },
      { name: 'Desktop RAM', match: ['desktop', 'dimm', 'udimm'] },
    ],
  },
  {
    category: 'Input Devices',
    slug: 'input-devices',
    match: ['keyboard', 'keyboards', 'mouse', 'mice', 'mousepad', 'mouse pad', 'input device', 'لوحة مفاتيح', 'ماوس'],
    subcategories: [
      // Mouse Pads must precede Mice: "Gaming mouse pads" contains "mouse".
      { name: 'Mouse Pads', match: ['mousepad', 'mouse pad', 'pad'] },
      { name: 'Keyboards', match: ['keyboard', 'لوحة مفاتيح'] },
      { name: 'Mice', match: ['mouse', 'mice', 'ماوس'] },
    ],
  },
  {
    category: 'Networking',
    slug: 'networking',
    match: ['wi-fi', 'wifi', 'network', 'router', 'ethernet', 'lan', 'airlive', 'شبكة'],
    subcategories: [
      { name: 'Wi-Fi Adapters', match: ['usb adapter', 'wifi usb', 'wi-fi usb', 'dongle'] },
      { name: 'Routers', match: ['router', 'access point'] },
    ],
  },
  {
    category: 'Hubs & Adapters',
    slug: 'hubs-adapters',
    match: ['hub', 'dock', 'adapter', 'adapters', 'otg', 'converter', 'converts', 'محول', 'موزع'],
    subcategories: [
      { name: 'USB-C Hubs', match: ['usb-c hub', 'type-c hub', 'docking'] },
      { name: 'OTG Adapters', match: ['otg', 'usb-otg'] },
      { name: 'Video Converters', match: ['hdmi to vga', 'vga to hdmi', 'converter'] },
    ],
  },
  {
    category: 'Accessories',
    slug: 'accessories',
    // 'stylus' but not 'pen': matching is whole-token, so a bare 'pen' would
    // also claim "Pen Drive", which is a flash drive and belongs in Storage.
    match: ['accessor', 'إكسسوارات', 'اكسسوارات', 'holder', 'case', 'screen protector', 'stand', 'mount', 'stylus'],
    subcategories: [
      { name: 'Phone Holders', match: ['holder', 'mount', 'حامل'] },
      { name: 'Screen Protectors', match: ['screen protector', 'tempered', 'واقي شاشة'] },
      { name: 'Cases', match: ['case', 'cover', 'جراب'] },
      { name: 'Styluses', match: ['stylus'] },
    ],
  },
  {
    category: 'Smart Home',
    slug: 'smart-home',
    match: ['robovac', 'vacuum', 'eufy', 'smart home', 'camera', 'كاميرا'],
    subcategories: [
      { name: 'Robot Vacuums', match: ['robovac', 'vacuum'] },
      { name: 'Trackers', match: ['smarttrack', 'tracker'] },
    ],
  },
  {
    category: 'Wearables',
    slug: 'wearables',
    match: ['smartwatch', 'watch', 'band', 'ساعة'],
    subcategories: [{ name: 'Smartwatches', match: ['smartwatch', 'watch'] }],
  },
];

/**
 * Folder names under Catalog/ mapped onto the taxonomy, for image linking.
 * The subcategory matters: Keyboard/ and Mouse/ both sit under Input Devices,
 * and without it a folder named "Dell" cannot tell the two apart.
 */
export const IMAGE_FOLDER_HINTS = {
  // New Catalog folder names (plural).
  Cables: { category: 'Cables' },
  Chargers: { category: 'Chargers' },
  'Power Banks': { category: 'Power Banks' },

  // Old Catalog folder names (singular), kept so a re-scan of the archive
  // still resolves.
  Cable: { category: 'Cables' },
  Charger: { category: 'Chargers' },
  Converts: { category: 'Hubs & Adapters' },
  Earbuds: { category: 'Audio', subcategory: 'True Wireless Earbuds' },
  'Flash Memory': { category: 'Storage', subcategory: 'USB Flash Drives' },
  Keyboard: { category: 'Input Devices', subcategory: 'Keyboards' },
  Mouse: { category: 'Input Devices', subcategory: 'Mice' },
  MousePad: { category: 'Input Devices', subcategory: 'Mouse Pads' },
  'Power Bank': { category: 'Power Banks' },
  RAM: { category: 'Memory' },
  SSD: { category: 'Storage', subcategory: 'SATA SSD' },
  Wireless: { category: 'Networking' },
};

export default TAXONOMY;
