/**
 * Dynamic column mapping dictionary.
 *
 * Nothing about the source layout is hardcoded in the parser — every column a
 * ByteHub catalog can contain is declared here as (canonical field, aliases,
 * patterns). Adding a supplier with new headers is a data edit, not a code change.
 *
 * `specificity` breaks ties when several definitions match one header:
 * "RDP (verified, EGP)" must win over the bare "RDP".
 */
export const COLUMN_DEFINITIONS = [
  /* ------------------------------ identity ------------------------------ */
  {
    field: 'row_number',
    specificity: 1,
    aliases: ['#', 'no', 'no.', 'num', 'index', 's/n', 'serial', 'م'],
  },
  {
    field: 'name',
    specificity: 5,
    aliases: [
      'product', 'product name', 'name', 'item', 'item name', 'title',
      'description', 'product title', 'model name', 'draft product',
      'المنتج', 'اسم المنتج', 'الصنف',
    ],
    patterns: [/^product(\s*name)?$/i, /^item(\s*name)?$/i],
  },
  {
    field: 'brand',
    specificity: 5,
    aliases: ['brand', 'manufacturer', 'make', 'vendor brand', 'الماركة', 'العلامة التجارية'],
  },
  {
    field: 'sku',
    specificity: 6,
    aliases: [
      'sku', 'model', 'model / sku', 'model/sku', 'model no', 'model number',
      'part number', 'mpn', 'product code', 'code', 'item code', 'كود المنتج', 'الموديل',
    ],
    patterns: [/\bsku\b/i, /^model\b/i, /\bpart\s*(no|number)\b/i],
  },
  {
    // "Supplier / SKU" carries both: the transformer splits it.
    field: 'supplier_sku',
    specificity: 8,
    aliases: ['supplier / sku', 'supplier/sku', 'supplier sku', 'vendor / sku', 'brand / sku'],
  },
  {
    field: 'supplier',
    specificity: 5,
    aliases: ['supplier', 'vendor', 'distributor', 'source supplier', 'المورد'],
  },
  {
    field: 'category',
    specificity: 5,
    aliases: ['category', 'product category', 'type', 'group', 'الفئة', 'التصنيف', 'القسم'],
  },
  {
    field: 'subcategory',
    specificity: 6,
    aliases: ['subcategory', 'sub category', 'sub-category', 'secondary category'],
  },

  /* ------------------------------- pricing ------------------------------ */
  {
    field: 'rdp',
    specificity: 9,
    aliases: [
      'rdp (verified, egp)', 'verified rdp (egp)', 'verified rdp', 'rdp verified',
      'rdp (verified)', 'actual rdp', 'confirmed cost',
    ],
    patterns: [/rdp.*verified/i, /verified.*rdp/i],
  },
  {
    field: 'rdp',
    specificity: 4,
    aliases: [
      'rdp', 'cost', 'wholesale', 'wholesale price', 'dealer price', 'buy price',
      'purchase price', 'cost price', 'unit cost', 'سعر الجملة', 'التكلفة',
    ],
    patterns: [/^rdp\b/i, /\bwholesale\b/i, /\bdealer\s*price\b/i],
  },
  {
    // The plan's own (unverified) figure — kept for the mismatch audit.
    field: 'rdp_reported',
    specificity: 9,
    aliases: ['rdp (plan, egp)', 'rdp plan', 'plan rdp', 'rdp (plan)', 'claimed rdp'],
    patterns: [/rdp.*plan/i, /plan.*rdp/i],
  },
  {
    field: 'rrp',
    specificity: 9,
    aliases: [
      'rrp (verified, egp)', 'verified rrp (egp)', 'verified rrp', 'rrp verified', 'rrp (verified)',
    ],
    patterns: [/rrp.*verified/i, /verified.*rrp/i],
  },
  {
    field: 'rrp',
    specificity: 4,
    aliases: [
      'rrp', 'msrp', 'retail price', 'recommended retail', 'list price',
      'سعر البيع المقترح', 'سعر القائمة',
    ],
    patterns: [/^rrp\b/i, /\bmsrp\b/i, /recommended\s*retail/i],
  },
  {
    field: 'rrp_reported',
    specificity: 9,
    aliases: ['rrp (plan, egp)', 'rrp plan', 'plan rrp', 'rrp (plan)'],
    patterns: [/rrp.*plan/i],
  },
  {
    field: 'selling_price',
    specificity: 6,
    aliases: [
      'selling price', 'sale price', 'sell price', 'our price', 'price',
      'est. price (usd)', 'est. price (egp)', 'est price', 'estimated price',
      'price (usd)', 'price (egp)', 'unit price', 'السعر', 'سعر البيع',
    ],
    patterns: [/^est\.?\s*price/i, /^price\b/i, /selling\s*price/i],
  },
  {
    field: 'market_price',
    specificity: 7,
    aliases: [
      'local market (egp)', 'local market', 'market price', 'street price',
      'competitor price', 'market range', 'سعر السوق',
    ],
    patterns: [/local\s*market/i, /market\s*(price|range)/i, /street\s*price/i],
  },
  {
    field: 'margin_reported',
    specificity: 6,
    aliases: [
      'margin', 'margin %', 'margin % (rrp basis)', 'margin percent', 'gross margin',
      'profit margin', 'هامش الربح',
    ],
    patterns: [/\bmargin\b/i],
  },
  {
    field: 'currency',
    specificity: 6,
    aliases: ['currency', 'ccy', 'العملة'],
  },
  {
    // Qty x RDP roll-up. Explicitly NOT a unit price — must not become rdp.
    field: 'extended_cost',
    specificity: 8,
    aliases: [
      'est. cost (egp, formula)', 'est. cost', 'estimated cost', 'total cost',
      'line total', 'extended cost', 'التكلفة الإجمالية',
    ],
    patterns: [/est\.?\s*cost/i, /total\s*cost/i, /line\s*total/i],
  },

  /* ----------------------------- inventory ------------------------------ */
  {
    field: 'quantity',
    specificity: 5,
    aliases: ['qty', 'quantity', 'stock', 'stock qty', 'units', 'on hand', 'الكمية'],
    patterns: [/^qty\b/i, /^quantity\b/i, /\bstock\b/i],
  },
  {
    field: 'warehouse',
    specificity: 5,
    aliases: ['warehouse', 'location', 'store'],
  },

  /* -------------------------------- specs ------------------------------- */
  {
    field: 'specs_raw',
    specificity: 6,
    aliases: [
      'key specifications', 'specifications', 'specs', 'key specs', 'technical specs',
      'key features', 'features', 'المواصفات', 'المميزات',
    ],
    patterns: [/\bspecs?\b/i, /specifications/i, /key\s*features/i],
  },
  {
    field: 'capacity',
    specificity: 6,
    aliases: [
      'capacity', 'capacity / speed / variants', 'size', 'storage', 'variants',
      'capacity/speed', 'السعة',
    ],
    patterns: [/\bcapacity\b/i],
  },
  {
    field: 'interface',
    specificity: 6,
    aliases: ['interface', 'connection', 'connector', 'port', 'المنفذ'],
  },
  {
    field: 'form_factor',
    specificity: 6,
    aliases: ['form factor', 'formfactor', 'format'],
  },
  {
    field: 'compatibility',
    specificity: 6,
    aliases: ['compatibility', 'compatible with', 'works with', 'التوافق', 'يتوافق مع'],
    patterns: [/compatib/i],
  },
  {
    field: 'condition',
    specificity: 6,
    aliases: ['condition', 'state', 'grade', 'الحالة'],
  },
  {
    field: 'warranty',
    specificity: 6,
    aliases: ['warranty', 'warranty months', 'guarantee', 'الضمان'],
  },
  {
    field: 'color',
    specificity: 5,
    aliases: ['color', 'colour', 'colors', 'اللون'],
  },

  /* ----------------------------- descriptive ---------------------------- */
  {
    field: 'short_description',
    specificity: 7,
    aliases: ['short description', 'summary', 'tagline', 'وصف مختصر'],
  },
  {
    field: 'long_description',
    specificity: 7,
    aliases: ['full description', 'long description', 'details', 'وصف تفصيلي'],
  },
  {
    field: 'notes',
    specificity: 5,
    aliases: [
      'notes', 'verification notes', 'note', 'remarks', 'comment', 'comments',
      'issue', 'missing fields', 'ملاحظات',
    ],
    patterns: [/\bnotes?\b/i, /\bremarks?\b/i],
  },
  {
    field: 'action',
    specificity: 7,
    aliases: [
      'recommended action', 'action', 'recommendation', 'decision', 'status',
      'الإجراء', 'التوصية',
    ],
    patterns: [/recommend/i, /^action$/i],
  },
  {
    field: 'source_catalog',
    specificity: 7,
    aliases: ['source catalog', 'source', 'origin', 'source file'],
  },
  {
    field: 'tags',
    specificity: 5,
    aliases: ['tags', 'labels', 'keywords'],
  },
];

/** Fields whose values run through the money parser. */
export const MONEY_FIELDS = new Set([
  'rdp',
  'rdp_reported',
  'rrp',
  'rrp_reported',
  'selling_price',
  'market_price',
  'extended_cost',
]);

/** Fields whose values run through the percent parser. */
export const PERCENT_FIELDS = new Set(['margin_reported']);

/** Fields whose values run through the integer parser. */
export const NUMERIC_FIELDS = new Set(['quantity', 'row_number']);

export default COLUMN_DEFINITIONS;
