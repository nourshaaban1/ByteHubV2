/**
 * ByteHub — New Catalog manifest.
 *
 * The folder tree under `New Catalog/` is the authoritative product list: one
 * folder is one sellable product. This file is the reviewable mapping from a
 * folder to the product it describes.
 *
 * RULES THIS FILE FOLLOWS, because a catalog is real money:
 *
 *   - Every SKU carries `sku_evidence` naming where it came from. A SKU with
 *     no evidence is null, and the importer generates a traceable placeholder.
 *   - Every price carries `price_source` naming the sheet it was read from.
 *     A product with no quoted price has `pricing: null` — never a guess.
 *     Those import normally and stay unpublished until someone supplies one.
 *   - Specs are stated only where the product name, the supplier workbook or
 *     the photo filenames say so. Nothing is inferred from what similar
 *     products usually have.
 *   - `conflicts` records every place two sources disagree, and `gaps` records
 *     what is missing. Both are surfaced in the admin rather than resolved
 *     silently.
 *
 * Prices are EGP.
 *
 *   rdp            wholesale cost
 *   rrp            recommended retail, kept as a reference figure only
 *   selling_price  what the customer pays — the workbook's FREE-SHIP LIST
 *                  PRICE, which is the agreed sell price plus the 45 EGP of
 *                  courier cost ByteHub absorbs so the product can be listed
 *                  with free delivery.
 *
 * The distinction matters: RRP runs well above the free-ship list price on
 * every line (JR-TCG13 lists at 595 against a 750 RRP), so pricing from RRP
 * would quote customers roughly a quarter more than the shop intends to charge.
 *
 * Only the SKUs the workbook actually approves — Must Buy and Test Buy — carry
 * a free-ship list price. A product quoted nowhere but an opportunity or
 * readiness note has an RRP and no agreed sell price, which is not the same
 * thing as a price, so it stays `pricing: null` and unpublished.
 */

/** Where a price came from, so any figure can be traced back to a sheet. */
const SRC = {
  MUST: 'ByteHub Catalog — Must Buy (Free-Ship List Price)',
  TEST: 'ByteHub Catalog — Test Buy (Free-Ship List Price)',
  AVOID: 'ByteHub Catalog — Avoid (no sell price agreed)',
  OPP: 'ByteHub Catalog — Additional Opportunities (reference RRP only)',
  NOTE: 'ByteHub Catalog — Generic Catalog (USD) reconciliation note',
};

export const CATALOG_ROOT = 'New Catalog';

export const PRODUCTS = [
  /* ================================ CABLES ================================ */
  {
    folder: 'Cables/Joyroom S-A42 Usb-A To Type-C 1.2m Cable',
    sku: 'S-A42',
    sku_evidence: 'Must Buy sheet; photo filenames read "…S-A42Three-Egypt.com…"',
    name: 'Joyroom S-A42 Crystal-Clear USB-A to USB-C Cable — 1.2 m, 3A',
    brand: 'Joyroom',
    category: 'Cables',
    subcategory: 'Charging Cables',
    pricing: { currency: 'EGP', rdp: 165, rrp: 375, selling_price: 295, price_source: SRC.MUST },
    procurement: 'must_buy',
    quantity: 30,
    specs: {
      cable_type: 'USB-A to USB-C',
      length_m: 1.2,
      power_wattage: 27,
      condition: 'new',
      features: ['3A fast charge', 'Crystal-Clear series', 'Charging and data'],
    },
    description: {
      short: 'Crystal-Clear USB-A to USB-C cable, 1.2 m, rated 3A.',
      long:
        'Joyroom S-A42, from the Crystal-Clear series, connects a standard USB-A charger or laptop port to any USB-C device. It is 1.2 metres long and rated for 3A charging, and carries both power and data over a single lead.',
    },
  },
  {
    folder: 'Cables/Joyroom Type-C to Type-C 1.2m Cable 60W',
    sku: 'S-A59',
    sku_evidence:
      'Must Buy sheet describes S-A59 as the "Vibrant Series 1.2-meter Type-C to Type-C" — an exact match for this folder',
    name: 'Joyroom S-A59 Vibrant USB-C to USB-C Cable — 1.2 m, 60W',
    brand: 'Joyroom',
    category: 'Cables',
    subcategory: 'Charging Cables',
    pricing: { currency: 'EGP', rdp: 120, rrp: 325, selling_price: 245, price_source: SRC.MUST },
    procurement: 'must_buy',
    quantity: 50,
    specs: {
      cable_type: 'USB-C to USB-C',
      length_m: 1.2,
      power_wattage: 60,
      condition: 'new',
      features: ['60W Power Delivery', 'Vibrant series', 'Charging and data'],
    },
    description: {
      short: 'Vibrant USB-C to USB-C cable, 1.2 m, 60W Power Delivery.',
      long:
        'Joyroom S-A59, from the Vibrant series, links two USB-C devices and carries up to 60W — enough to fast-charge a phone, a tablet or a compact laptop. It is 1.2 metres long and sold in several colours at one price.',
    },
    conflicts: [
      'Photo filenames read "…Cable60WS-A42…", but S-A42 is the USB-A cable listed separately. The Must Buy sheet describes S-A59 as exactly this product, so S-A59 is used here — worth confirming.',
    ],
  },
  {
    folder:
      'Cables/Joyroom SA21-1T3 cable Speedy Series 100W 3-in 1 Fast Charging Cable (USB-A to L+C+M)',
    sku: 'SA21-1T3',
    sku_evidence: 'Test Buy sheet; folder name',
    name: 'Joyroom SA21-1T3 Speedy 3-in-1 Charging Cable — 100W',
    brand: 'Joyroom',
    category: 'Cables',
    subcategory: 'Multi-Head Cables',
    pricing: { currency: 'EGP', rdp: 265, rrp: 525, selling_price: 445, price_source: SRC.TEST },
    procurement: 'test_buy',
    quantity: 10,
    specs: {
      cable_type: 'USB-A to Lightning + USB-C + Micro-USB',
      power_wattage: 100,
      condition: 'new',
      compatibility: ['iPhone (Lightning)', 'USB-C phones and tablets', 'Micro-USB devices'],
      features: ['Three connectors on one lead', '100W rating', 'Speedy series', 'USB-A input'],
    },
    description: {
      short: 'One USB-A cable ending in Lightning, USB-C and Micro-USB. Rated 100W.',
      long:
        'The Speedy Series SA21-1T3 replaces three cables with one: a single USB-A lead ending in Lightning, USB-C and Micro-USB connectors, so the same cable covers an iPhone, an Android phone and an older accessory.',
    },
    conflicts: [
      'Joyroom reuses the code SA21-1T3 for two different cables — a 30W Type-C-input version and this 100W USB-A-input version. The price here is the 100W USB-A one; confirm which is being ordered.',
    ],
  },
  {
    folder:
      'Cables/Joyroom SA21-2T3 cable Speedy Series 100W 6-in 1 Fast Charging Cable (USB-A+Type C to L+C+M C to L+C+M)',
    sku: 'SA21-2T3',
    sku_evidence: 'Test Buy sheet; folder name',
    name: 'Joyroom SA21-2T3 Speedy 6-in-1 Charging Cable — 100W',
    brand: 'Joyroom',
    category: 'Cables',
    subcategory: 'Multi-Head Cables',
    pricing: { currency: 'EGP', rdp: 495, rrp: 790, selling_price: 645, price_source: SRC.TEST },
    procurement: 'test_buy',
    quantity: 8,
    specs: {
      cable_type: 'USB-A and USB-C to Lightning + USB-C + Micro-USB',
      power_wattage: 100,
      condition: 'new',
      compatibility: ['iPhone (Lightning)', 'USB-C phones and tablets', 'Micro-USB devices'],
      features: ['Two inputs, three outputs', 'USB-A and USB-C input', '100W rating', 'Speedy series'],
    },
    description: {
      short: 'Six connector combinations in one cable: USB-A or USB-C in, Lightning, USB-C or Micro-USB out.',
      long:
        'The Speedy Series SA21-2T3 accepts either a USB-A or a USB-C charger and ends in Lightning, USB-C and Micro-USB tips — six working combinations from a single lead, rated to 100W.',
    },
  },
  {
    folder: 'Chargers/Joyroom S-A60 StarTalk 100W',
    sku: 'S-A60',
    sku_evidence: 'Test Buy sheet, which names it "S-A60 StarTalk 100W USB-C Data and Charging Cable 1.2m"',
    name: 'Joyroom S-A60 StarTalk USB-C to USB-C Cable — 1.2 m, 100W',
    brand: 'Joyroom',
    // Filed under Chargers/ on disk, but the supplier sheet is explicit that
    // this is a cable. Categorised by what the product is, not where the photos sit.
    category: 'Cables',
    subcategory: 'Charging Cables',
    pricing: { currency: 'EGP', rdp: 185, rrp: 450, selling_price: 345, price_source: SRC.TEST },
    procurement: 'test_buy',
    quantity: 15,
    specs: {
      cable_type: 'USB-C to USB-C',
      length_m: 1.2,
      power_wattage: 100,
      condition: 'new',
      features: ['100W Power Delivery', 'StarTalk series', 'Charging and data'],
    },
    description: {
      short: 'StarTalk USB-C to USB-C cable, 1.2 m, rated 100W.',
      long:
        'Joyroom S-A60 from the StarTalk series is a 1.2-metre USB-C to USB-C lead rated to 100W, which covers fast phone charging and most USB-C laptops. It carries data as well as power.',
    },
    conflicts: [
      'The photos live in the Chargers folder, but the supplier sheet lists this as a cable. It has been categorised as a cable.',
    ],
  },
  {
    folder: 'Cables/Anker Cable 322 USB-A to USB-C 3ft',
    sku: null,
    sku_evidence: null,
    name: 'Anker 322 USB-A to USB-C Cable — 0.9 m, Braided',
    brand: 'Anker',
    category: 'Cables',
    subcategory: 'Charging Cables',
    pricing: null,
    specs: {
      cable_type: 'USB-A to USB-C',
      length_m: 0.9,
      condition: 'new',
      features: ['Braided jacket', 'Anker 322 series'],
    },
    description: {
      short: 'Braided USB-A to USB-C cable from Anker, 3 ft (0.9 m).',
      long:
        'Anker 322 is a braided USB-A to USB-C cable, 3 feet long, for charging and syncing USB-C devices from a standard USB-A port.',
    },
    gaps: ['No wholesale or retail price in any supplier sheet', 'No model code confirmed'],
  },
  {
    folder: 'Cables/Anker Nylon Cable 322 USB-C to USB-C - 3.3ft - 60W',
    sku: null,
    sku_evidence: null,
    name: 'Anker Nylon USB-C to USB-C Cable — 1 m, 60W',
    brand: 'Anker',
    category: 'Cables',
    subcategory: 'Charging Cables',
    pricing: null,
    specs: {
      cable_type: 'USB-C to USB-C',
      length_m: 1,
      power_wattage: 60,
      condition: 'new',
      features: ['Nylon braided jacket', '60W Power Delivery'],
    },
    description: {
      short: 'Nylon-braided USB-C to USB-C cable, 3.3 ft (1 m), 60W.',
      long:
        'A nylon-braided USB-C to USB-C cable rated for 60W Power Delivery, enough to fast-charge phones, tablets and compact laptops. It is 3.3 feet long.',
    },
    conflicts: [
      'The folder says "322" but every photo filename says "anker-333". Anker 322 is the USB-A to USB-C line and 333 is the USB-C to USB-C line, so the photos are likely correct. The model needs confirming.',
    ],
    gaps: ['No wholesale or retail price in any supplier sheet', 'Model line unresolved (322 vs 333)'],
  },
  {
    folder: 'Cables/Anker Nylon Cable USB-A to USB-C - 6ft',
    sku: null,
    sku_evidence: null,
    name: 'Anker Nylon USB-A to USB-C Cable — 1.8 m',
    brand: 'Anker',
    category: 'Cables',
    subcategory: 'Charging Cables',
    pricing: null,
    specs: {
      cable_type: 'USB-A to USB-C',
      length_m: 1.8,
      condition: 'new',
      features: ['Nylon braided jacket', 'USB 2.0'],
    },
    description: {
      short: 'Nylon-braided USB-A to USB-C cable, 6 ft (1.8 m).',
      long:
        'A longer nylon-braided lead for charging USB-C devices from a standard USB-A port. Six feet gives enough reach to keep using a phone while it charges from a wall socket.',
    },
    gaps: ['No wholesale or retail price in any supplier sheet', 'No model code confirmed'],
  },
  {
    folder: 'Cables/GENERAL CABLE TYPE C TO TYPE C',
    sku: null,
    sku_evidence: null,
    name: 'USB-C to USB-C Charging Cable',
    brand: null,
    category: 'Cables',
    subcategory: 'Charging Cables',
    pricing: null,
    is_generic: true,
    specs: { cable_type: 'USB-C to USB-C', condition: 'new' },
    description: {
      short: 'Unbranded USB-C to USB-C charging cable.',
      long: 'A plain USB-C to USB-C lead for charging and data.',
    },
    gaps: ['Unbranded placeholder — no brand, model, length, wattage or price recorded'],
  },
  {
    folder: 'Cables/GENERAL CABLE TYPE C TO IPHONE',
    sku: null,
    sku_evidence: null,
    name: 'USB-C to Lightning Charging Cable',
    brand: null,
    category: 'Cables',
    subcategory: 'Charging Cables',
    pricing: null,
    is_generic: true,
    specs: {
      cable_type: 'USB-C to Lightning',
      condition: 'new',
      compatibility: ['iPhone (Lightning)'],
    },
    description: {
      short: 'Unbranded USB-C to Lightning charging cable.',
      long: 'A plain USB-C to Lightning lead for charging an iPhone from a USB-C charger.',
    },
    gaps: ['Unbranded placeholder — no brand, model, length, wattage or price recorded'],
  },
  {
    folder: 'Cables/GENERAL CABLE USB TO TYPE C',
    sku: null,
    sku_evidence: null,
    name: 'USB-A to USB-C Charging Cable',
    brand: null,
    category: 'Cables',
    subcategory: 'Charging Cables',
    pricing: null,
    is_generic: true,
    specs: { cable_type: 'USB-A to USB-C', condition: 'new' },
    description: {
      short: 'Unbranded USB-A to USB-C charging cable.',
      long: 'A plain USB-A to USB-C lead for charging and data.',
    },
    gaps: ['Unbranded placeholder — no brand, model, length, wattage or price recorded'],
  },
  {
    folder: 'Cables/GENERAL CABLE USB TO IPHONE',
    sku: null,
    sku_evidence: null,
    name: 'USB-A to Lightning Charging Cable',
    brand: null,
    category: 'Cables',
    subcategory: 'Charging Cables',
    pricing: null,
    is_generic: true,
    specs: {
      cable_type: 'USB-A to Lightning',
      condition: 'new',
      compatibility: ['iPhone (Lightning)'],
    },
    description: {
      short: 'Unbranded USB-A to Lightning charging cable.',
      long: 'A plain USB-A to Lightning lead for charging an iPhone from a standard USB charger.',
    },
    gaps: ['Unbranded placeholder — no brand, model, length, wattage or price recorded'],
  },

  /* =============================== CHARGERS =============================== */
  {
    folder: 'Chargers/Joyroom 45W GaN USB-C Charger',
    sku: 'JR-TCG13',
    sku_evidence: 'Must Buy sheet; photo filenames read "…JR-TCG13Three-Egypt.com…"',
    name: 'Joyroom JR-TCG13 GaN Wall Charger — 45W USB-C',
    brand: 'Joyroom',
    category: 'Chargers',
    subcategory: 'Wall Chargers',
    pricing: { currency: 'EGP', rdp: 440, rrp: 750, selling_price: 595, price_source: SRC.MUST },
    procurement: 'must_buy',
    quantity: 30,
    specs: {
      power_wattage: 45,
      condition: 'new',
      features: ['GaN', 'USB-C Power Delivery', '45W output'],
      compatibility: ['USB-C phones and tablets', 'USB-C laptops up to 45W'],
    },
    description: {
      short: 'GaN wall charger with a single USB-C port, 45W.',
      long:
        'Joyroom JR-TCG13 uses gallium nitride to fit 45W of USB-C Power Delivery into a small plug. That is enough to fast-charge a phone or tablet, or to run a compact laptop.',
    },
  },
  {
    folder: 'Chargers/Joyroom 45W 3 Port Gallium Nitride GaN Wall Charger',
    sku: 'JR-TO1',
    sku_evidence: 'Photo filenames read "…GaNWallChargerJR-TO1Three-Egypt.com…"',
    name: 'Joyroom JR-TO1 GaN Wall Charger — 45W, 3 Ports',
    brand: 'Joyroom',
    category: 'Chargers',
    subcategory: 'Wall Chargers',
    pricing: null,
    specs: {
      power_wattage: 45,
      condition: 'new',
      features: ['GaN', 'Three ports', '45W total output'],
    },
    description: {
      short: 'Three-port GaN wall charger rated 45W in total.',
      long:
        'Joyroom JR-TO1 is a gallium-nitride wall charger with three ports and 45W of total output, so a phone, earbuds and a second device can charge from one socket.',
    },
    gaps: [
      'No wholesale or retail price in any supplier sheet',
      'Port layout (how many USB-C vs USB-A) not recorded anywhere',
    ],
  },
  {
    folder: 'Chargers/Joyroom PD 30W Wall Charger',
    sku: 'JR-TCF24',
    sku_evidence: 'Photo filenames read "…JoyroomPD30WWallChargerJR-TCF24Three-Egypt.com…"',
    name: 'Joyroom JR-TCF24 PD Wall Charger — 30W',
    brand: 'Joyroom',
    category: 'Chargers',
    subcategory: 'Wall Chargers',
    pricing: null,
    specs: {
      power_wattage: 30,
      condition: 'new',
      features: ['USB-C Power Delivery', '30W output'],
    },
    description: {
      short: 'Compact USB-C wall charger, 30W Power Delivery.',
      long:
        'Joyroom JR-TCF24 delivers 30W over USB-C Power Delivery — enough to fast-charge a phone or a tablet from a single small plug.',
    },
    gaps: [
      'No wholesale or retail price in any supplier sheet',
      'The workbook prices JR-TCF20 (a 20W charger), which is a different model',
    ],
  },
  {
    folder: 'Chargers/Anker Wall Charger 25W Compact',
    sku: null,
    sku_evidence: null,
    name: 'Anker Compact Wall Charger — 25W',
    brand: 'Anker',
    category: 'Chargers',
    subcategory: 'Wall Chargers',
    pricing: null,
    specs: { power_wattage: 25, condition: 'new', features: ['Compact body', '25W output'] },
    description: {
      short: 'Compact Anker wall charger rated 25W.',
      long: 'A small Anker wall charger delivering 25W, sized to sit flush against a socket.',
    },
    gaps: ['No wholesale or retail price in any supplier sheet', 'No model code confirmed'],
  },
  {
    folder: 'Chargers/Anker Zolo Wall Charger 30W',
    sku: null,
    sku_evidence: null,
    name: 'Anker Zolo Wall Charger — 30W',
    brand: 'Anker',
    category: 'Chargers',
    subcategory: 'Wall Chargers',
    pricing: null,
    specs: { power_wattage: 30, condition: 'new', features: ['Zolo series', 'USB-C output'] },
    description: {
      short: 'Anker Zolo USB-C wall charger, 30W.',
      long: 'A USB-C wall charger from Anker’s Zolo line, rated 30W.',
    },
    conflicts: [
      'The folder says 30W but the only photo is named "anker-zolo-charger-25w-usb-c-charger-black". The wattage needs confirming before this is listed.',
    ],
    gaps: ['No wholesale or retail price in any supplier sheet', 'Output wattage disputed (30W vs 25W)'],
  },
  {
    folder: 'Chargers/GENERAL USB-A CHARGER',
    sku: null,
    sku_evidence: null,
    name: 'USB-A Wall Charger',
    brand: null,
    category: 'Chargers',
    subcategory: 'Wall Chargers',
    pricing: null,
    is_generic: true,
    specs: { condition: 'new' },
    description: {
      short: 'Unbranded USB-A wall charger.',
      long: 'A plain wall charger with a standard USB-A port.',
    },
    gaps: ['Unbranded placeholder — no brand, model, wattage or price recorded'],
  },

  /* ================================ AUDIO ================================= */
  {
    folder: 'Earbuds/Anker Soundcore R50i NC A3959',
    sku: 'A3959',
    sku_evidence: 'Additional Opportunities and Website Readiness sheets; folder name',
    name: 'Anker Soundcore R50i NC True Wireless Earbuds',
    brand: 'Soundcore',
    category: 'Audio',
    subcategory: 'True Wireless Earbuds',
    // Quoted at RDP 1,390 / RRP 1,699 in the Additional Opportunities sheet,
    // which lists what could be stocked — not what has been approved to sell.
    // No agreed sell price means no free-ship list price, so nothing to charge.
    pricing: null,
    gaps: [
      'No agreed sell price: the workbook carries a reference RRP of 1,699 EGP in an opportunity note, but no Free-Ship List Price',
    ],
    specs: {
      condition: 'new',
      interface: 'Bluetooth 5.4',
      features: [
        'Active noise cancelling',
        '10 mm drivers',
        'Up to 10 h per charge, 45 h with the case',
        'IP54 water and dust resistance',
        'Four microphones for calls',
      ],
    },
    description: {
      short: 'Noise-cancelling true wireless earbuds with 10 mm drivers and IP54 protection.',
      long:
        'Soundcore R50i NC pairs 10 mm drivers with active noise cancellation, running about 10 hours on a charge and 45 hours with the case. Bluetooth 5.4, four microphones for calls, and an IP54 rating against dust and splashes.',
    },
  },
  {
    folder: 'Earbuds/Anker Soundcore R50i A3949 Standard Edition',
    sku: 'A3969',
    sku_evidence:
      'Website Readiness and Generic Catalog sheets both give A3969 for the plain R50i (no ANC)',
    name: 'Anker Soundcore R50i True Wireless Earbuds',
    brand: 'Soundcore',
    category: 'Audio',
    subcategory: 'True Wireless Earbuds',
    // RDP 880 / RRP 1,099 appears only as a reconciliation note against a
    // generic USD row. It was never carried into Must Buy or Test Buy.
    pricing: null,
    gaps: [
      'No agreed sell price: the workbook carries a reference RRP of 1,099 EGP in a reconciliation note, but no Free-Ship List Price',
    ],
    specs: {
      condition: 'new',
      interface: 'Bluetooth 5.3',
      features: [
        '10 mm drivers',
        'Up to 10 h per charge, 30 h with the case',
        'IPX5 water resistance',
        'Two microphones for calls',
      ],
    },
    description: {
      short: 'True wireless earbuds with 10 mm drivers and up to 30 hours of total playback.',
      long:
        'The standard Soundcore R50i runs 10 mm drivers over Bluetooth 5.3, giving about 10 hours per charge and 30 hours with the case. Rated IPX5 against water, with two microphones for calls. This is the model without active noise cancelling.',
    },
    conflicts: [
      'The folder name says A3949, but the workbook gives A3969 for the plain R50i on two separate sheets. A3969 is used here; please confirm which code is on the box.',
    ],
  },
  {
    folder: 'Earbuds/Anker Soundcore Liberty 5 Noise Cancelling Earbuds',
    sku: 'A3957',
    sku_evidence: 'Generic Catalog sheet: "Anker ‘Liberty 5’ A3957, RDP 4,350 / RRP 5,111 EGP"',
    name: 'Anker Soundcore Liberty 5 Noise Cancelling Earbuds',
    brand: 'Soundcore',
    category: 'Audio',
    subcategory: 'True Wireless Earbuds',
    // RDP 4,350 / RRP 5,111 appears only as a reconciliation note against a
    // generic USD row. It was never carried into Must Buy or Test Buy.
    pricing: null,
    gaps: [
      'No agreed sell price: the workbook carries a reference RRP of 5,111 EGP in a reconciliation note, but no Free-Ship List Price',
    ],
    specs: {
      condition: 'new',
      interface: 'Bluetooth 5.3',
      color: 'Black, Blue, Golden, White',
      features: [
        'Adaptive noise cancelling',
        'Dolby Audio',
        'Up to 12 h per charge, 48 h with the case (ANC off)',
        'Up to 8 h per charge, 32 h with the case (ANC on)',
        '10 minutes of charge for about 5 hours of play',
        'Wireless charging case',
      ],
    },
    description: {
      short: 'Premium noise-cancelling earbuds with Dolby Audio and a wireless charging case.',
      long:
        'Soundcore Liberty 5 is the premium model in the range: adaptive noise cancelling, Dolby Audio, and up to 48 hours of total playback with the case when ANC is off, or 32 with it on. Ten minutes on charge gives roughly five hours of listening, and the case charges wirelessly.',
    },
    variants: ['Black', 'Blue', 'Golden', 'White'],
  },
  {
    folder: 'Earbuds/Joyroom JR-FN3 ANC+ENC True Wireless Bluetooth Earphones Funpods series',
    sku: 'JR-FN3',
    sku_evidence: 'Test Buy sheet; folder name',
    name: 'Joyroom JR-FN3 Funpods ANC True Wireless Earbuds',
    brand: 'Joyroom',
    category: 'Audio',
    subcategory: 'True Wireless Earbuds',
    pricing: { currency: 'EGP', rdp: 925, rrp: 1400, selling_price: 1245, price_source: SRC.TEST },
    procurement: 'test_buy',
    quantity: 8,
    specs: {
      condition: 'new',
      features: ['Active noise cancelling (ANC)', 'Environmental noise cancelling for calls (ENC)', 'Funpods series'],
    },
    description: {
      short: 'True wireless earbuds with noise cancelling for both listening and calls.',
      long:
        'Joyroom JR-FN3 from the Funpods series combines ANC, which cuts background noise while you listen, with ENC, which cleans up your voice on calls.',
    },
    gaps: ['Battery life, driver size and water resistance are not recorded in any source'],
  },

  /* ============================= POWER BANKS ============================== */
  {
    folder: 'Power Bank/Joyroom JR-PR1 10000mAh Mini Power Bank - 22.5W',
    sku: 'JR-PR1',
    sku_evidence:
      'Test Buy sheet, which also records the correction from the non-existent code JR-PK1',
    name: 'Joyroom JR-PR1 Mini Power Bank — 10,000 mAh, 22.5W',
    brand: 'Joyroom',
    category: 'Power Banks',
    subcategory: 'Retractable Power Banks',
    pricing: { currency: 'EGP', rdp: 990, rrp: 1399, selling_price: 1145, price_source: SRC.TEST },
    procurement: 'test_buy',
    quantity: 5,
    specs: {
      battery_capacity: 10000,
      power_wattage: 22.5,
      condition: 'new',
      features: ['Built-in retractable cable', '22.5W fast charging', 'Compact body'],
    },
    description: {
      short: '10,000 mAh power bank with a built-in retractable cable, 22.5W.',
      long:
        'Joyroom JR-PR1 carries 10,000 mAh and charges at up to 22.5W, with a retractable cable built into the body so there is nothing separate to carry.',
    },
    conflicts: [
      'The purchase plan originally listed this as JR-PK1, a code that does not exist in the Joyroom price list. JR-PR1 is the correct code and must be used on any purchase order.',
    ],
  },
  {
    folder:
      'Power Bank/JOYROOM JR-PBM01 20W Magnetic Wireless Power Bank 10000mAh with Built-in Cable & Kickstand',
    sku: 'JR-PBM01',
    sku_evidence: 'Test Buy sheet; folder name',
    name: 'Joyroom JR-PBM01 Magnetic Wireless Power Bank — 10,000 mAh, 20W',
    brand: 'Joyroom',
    category: 'Power Banks',
    subcategory: 'Magnetic Power Banks',
    pricing: { currency: 'EGP', rdp: 1100, rrp: 1500, selling_price: 1245, price_source: SRC.TEST },
    procurement: 'test_buy',
    quantity: 5,
    specs: {
      battery_capacity: 10000,
      power_wattage: 20,
      condition: 'new',
      features: ['Magnetic wireless charging', 'Built-in cable', 'Kickstand', '20W output'],
      compatibility: ['MagSafe-compatible iPhones', 'USB-C devices via the built-in cable'],
    },
    description: {
      short: '10,000 mAh magnetic power bank with wireless charging, a built-in cable and a kickstand.',
      long:
        'Joyroom JR-PBM01 snaps magnetically onto the back of a compatible phone and charges it wirelessly at up to 20W. It also has a cable built in for wired devices, and a kickstand so the phone can be propped up while it charges.',
    },
  },
  {
    folder: 'Power Bank/Joyroom Star Series Mini 22.5W Digital Display Fast Charging Power Bank 10,000mAh',
    sku: 'JR-QP191',
    sku_evidence:
      'Photo filenames read "…PowerBank10_000mAhJR-QP191Three-Egypt.com…"; the Generic Catalog sheet quotes JR-QP191 Mini at RDP 675 / RRP 999',
    name: 'Joyroom JR-QP191 Star Series Mini Power Bank — 10,000 mAh, 22.5W',
    brand: 'Joyroom',
    category: 'Power Banks',
    // The workbook approves the JR-QP192 Mini (20,000 mAh) and calls this
    // 10,000 mAh QP191 a 'close cousin' — a comparison, not an approval.
    pricing: null,
    gaps: [
      'No agreed sell price: the workbook approves the 20,000 mAh JR-QP192 and quotes this one only as a reference RRP of 999 EGP',
    ],
    specs: {
      battery_capacity: 10000,
      power_wattage: 22.5,
      condition: 'new',
      features: ['Digital charge display', '22.5W fast charging', 'Compact body', 'Star series'],
    },
    description: {
      short: '10,000 mAh power bank with a digital charge display, 22.5W.',
      long:
        'Joyroom JR-QP191 from the Star Series holds 10,000 mAh and charges at up to 22.5W. A digital display shows exactly how much charge is left rather than four indicator dots.',
    },
    conflicts: [
      'The workbook’s Must Buy sheet prices JR-QP192, which is the 20,000 mAh version of the same series. This folder is the 10,000 mAh JR-QP191, priced from the Generic Catalog reconciliation note.',
    ],
  },
  {
    folder: 'Power Bank/Anker Zolo Power Bank 10,000mAH 22.5W Built-In USB-C Cable',
    sku: 'A110D',
    sku_evidence: 'Photo filenames read "…black-a110dh11.jpg"; the Avoid sheet prices A110D (Zolo 10K)',
    name: 'Anker Zolo Power Bank — 10,000 mAh, 22.5W, Built-In USB-C Cable',
    brand: 'Anker',
    category: 'Power Banks',
    // On the Avoid sheet, which quotes cost and retail precisely to argue
    // against stocking it. Deliberately no sell price and no free-ship price.
    pricing: null,
    gaps: [
      'Not approved for sale: the Avoid sheet quotes RDP 1,150 / RRP 1,399 to make the case against stocking it, and sets no sell price',
    ],
    procurement: 'avoid',
    specs: {
      battery_capacity: 10000,
      power_wattage: 22.5,
      condition: 'new',
      features: ['Built-in USB-C cable', '22.5W fast charging', 'Zolo series'],
    },
    description: {
      short: '10,000 mAh Anker power bank with a USB-C cable built into the body, 22.5W.',
      long:
        'The Anker Zolo power bank holds 10,000 mAh and charges at up to 22.5W, with a USB-C cable built into the casing so there is no separate lead to lose.',
    },
    conflicts: [
      'The workbook places A110D on the Avoid list — the wholesale discount is thin, leaving roughly an 18% margin. It is imported and priced, but flagged so the decision to stock it stays deliberate.',
    ],
  },
  {
    folder: 'Power Bank/Anker Zolo Power Bank 20,000mAH 22.5W Built-In USB-C Cable',
    sku: null,
    sku_evidence: null,
    name: 'Anker Zolo Power Bank — 20,000 mAh, 22.5W, Built-In USB-C Cable',
    brand: 'Anker',
    category: 'Power Banks',
    subcategory: 'High Capacity',
    pricing: null,
    specs: {
      battery_capacity: 20000,
      power_wattage: 22.5,
      condition: 'new',
      features: ['Built-in USB-C cable', '22.5W fast charging', 'Zolo series'],
    },
    description: {
      short: '20,000 mAh Anker power bank with a USB-C cable built into the body, 22.5W.',
      long:
        'The 20,000 mAh Anker Zolo holds roughly two full phone charges and delivers up to 22.5W, with a USB-C cable built into the casing.',
    },
    conflicts: [
      'Every photo in this folder is byte-identical to the 10,000 mAh folder and the filenames read "10000mah…a110dh11". These are the wrong product photos and should be replaced before listing.',
    ],
    gaps: ['No wholesale or retail price in any supplier sheet', 'No model code confirmed', 'Photos belong to the 10,000 mAh model'],
  },
  {
    folder: 'Power Bank/Joyroom JR-PBF15 10000mAh Power Bank, 22.5W Fast Charging, LED Display',
    sku: 'JR-PBF12',
    sku_evidence:
      'Must Buy sheet prices "Joyroom JR-PBF12 10000mAh LED Power Bank 22.5W"; confirmed by the shop as the same product this folder photographs. The folder name still reads PBF15.',
    name: 'Joyroom JR-PBF12 Power Bank — 10,000 mAh, 22.5W, LED Display',
    brand: 'Joyroom',
    category: 'Power Banks',
    pricing: { currency: 'EGP', rdp: 420, rrp: 730, selling_price: 625, price_source: SRC.MUST },
    procurement: 'must_buy',
    quantity: 20,
    specs: {
      battery_capacity: 10000,
      power_wattage: 22.5,
      condition: 'new',
      features: ['LED charge display', '22.5W fast charging'],
    },
    description: {
      short: '10,000 mAh power bank with an LED charge display, 22.5W.',
      long:
        'Joyroom JR-PBF15 holds 10,000 mAh and charges at up to 22.5W, with an LED display reading out the remaining charge as a number.',
    },
    conflicts: [
      'The folder is named JR-PBF15, a code that appears in no supplier sheet. The shop confirmed it is the JR-PBF12 the workbook prices, so the SKU here is PBF12 and the folder name is the one that is wrong. Worth renaming the folder before the next import.',
    ],
    gaps: ['No wholesale or retail price for PBF15 in any supplier sheet'],
  },
];

/** Products with a quoted price, which are the ones that can reach the shop. */
export const pricedProducts = () => PRODUCTS.filter((product) => product.pricing);

/** Everything the manifest knows is missing or disputed, for the gap report. */
export function openQuestions() {
  return PRODUCTS.flatMap((product) => [
    ...(product.conflicts ?? []).map((text) => ({ folder: product.folder, kind: 'conflict', text })),
    ...(product.gaps ?? []).map((text) => ({ folder: product.folder, kind: 'gap', text })),
  ]);
}

export default PRODUCTS;
