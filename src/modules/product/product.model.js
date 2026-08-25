import mongoose from 'mongoose';
import {
  CURRENCIES,
  PROCUREMENT_STATUS,
  LIFECYCLE,
  CONDITIONS,
} from '../../shared/constants/enums.js';
import { SEVERITY } from '../../shared/constants/issues.js';
import { normalizeKey, slugify } from '../../shared/utils/text.js';
import { computeFingerprint, skuKey } from '../../shared/utils/fingerprint.js';
import { isPublishable } from './product.publishable.js';

const { Schema } = mongoose;

const subSchemaOptions = { _id: false };

/** A parsed money value that may have arrived as a range or an estimate. */
const AmountSchema = new Schema(
  {
    value: { type: Number, default: null, min: 0 },
    min: { type: Number, default: null, min: 0 },
    max: { type: Number, default: null, min: 0 },
    is_range: { type: Boolean, default: false },
    is_estimated: { type: Boolean, default: false },
    raw: { type: String, default: null },
  },
  subSchemaOptions,
);

const PricingSchema = new Schema(
  {
    currency: { type: String, enum: [...CURRENCIES, null], default: null, uppercase: true },

    // Core figures, always stored in `currency`.
    rdp: { type: Number, default: null, min: 0 }, // wholesale / dealer cost
    rrp: { type: Number, default: null, min: 0 }, // recommended retail
    selling_price: { type: Number, default: null, min: 0 },

    // Per-spec: (selling_price - rdp) / rdp — markup on cost.
    margin_percentage: { type: Number, default: null },
    // Retail convention: (selling_price - rdp) / selling_price — share of revenue.
    gross_margin_percentage: { type: Number, default: null },
    margin_value: { type: Number, default: null },
    margin_band: {
      type: String,
      enum: ['loss', 'critical', 'low', 'healthy', 'target', 'implausible', 'unknown'],
      default: 'unknown',
    },

    // Observed local street prices, used to sanity-check RRP.
    market_low: { type: Number, default: null, min: 0 },
    market_high: { type: Number, default: null, min: 0 },

    // Range/estimate provenance kept so nothing from the source is lost.
    detail: {
      rdp: { type: AmountSchema, default: undefined },
      rrp: { type: AmountSchema, default: undefined },
      selling_price: { type: AmountSchema, default: undefined },
      market: { type: AmountSchema, default: undefined },
    },

    // Variant pricing, e.g. "64GB: $6-$9 | 128GB: $9-$13".
    variants: [
      new Schema(
        {
          label: String,
          min: Number,
          max: Number,
          value: Number,
          currency: String,
        },
        subSchemaOptions,
      ),
    ],

    // Everything normalised into BASE_CURRENCY for cross-currency analytics.
    normalized: {
      currency: { type: String, default: null },
      rdp: { type: Number, default: null },
      rrp: { type: Number, default: null },
      selling_price: { type: Number, default: null },
      fx_rate: { type: Number, default: null },
      fx_rate_at: { type: Date, default: null },
    },

    is_estimated: { type: Boolean, default: false },
    price_source: { type: String, default: null }, // e.g. "Joyroom price list 26-Jul-2026"
    last_priced_at: { type: Date, default: null },
  },
  subSchemaOptions,
);

const SpecsSchema = new Schema(
  {
    // Promoted fields required by the brief.
    power_wattage: { type: Number, default: null },
    cable_type: { type: String, default: null },
    compatibility: { type: [String], default: [] },
    battery_capacity: { type: Number, default: null }, // mAh

    // Frequently-present across ByteHub's real catalogs.
    capacity: { type: String, default: null }, // "64GB", "1TB"
    capacity_gb: { type: Number, default: null },
    interface: { type: String, default: null },
    form_factor: { type: String, default: null },
    length_m: { type: Number, default: null },
    color: { type: String, default: null },
    warranty_months: { type: Number, default: null },
    condition: { type: String, enum: [...CONDITIONS], default: 'unknown' },
    features: { type: [String], default: [] },

    /**
     * Anything else the source supplied. A Map means a new category
     * (UPS, router, smartwatch) needs zero schema changes.
     */
    attributes: { type: Map, of: String, default: () => new Map() },
  },
  subSchemaOptions,
);

const InventorySchema = new Schema(
  {
    quantity: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    reorder_point: { type: Number, default: null, min: 0 },
    supplier: { type: String, default: null },
    alternate_suppliers: { type: [String], default: [] },
    warehouse: { type: String, default: null },
    lead_time_days: { type: Number, default: null, min: 0 },
  },
  subSchemaOptions,
);

const StatusSchema = new Schema(
  {
    is_verified: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    is_generic: { type: Boolean, default: false },
    is_draft: { type: Boolean, default: false },
    lifecycle: { type: String, enum: LIFECYCLE, default: 'draft' },
    procurement: { type: String, enum: PROCUREMENT_STATUS, default: 'unclassified' },
    verified_by: { type: String, default: null },
    verified_at: { type: Date, default: null },
  },
  subSchemaOptions,
);

const IssueSchema = new Schema(
  {
    code: { type: String, required: true },
    severity: { type: String, enum: Object.values(SEVERITY), default: SEVERITY.INFO },
    message: { type: String, default: null },
    field: { type: String, default: null },
    context: { type: Schema.Types.Mixed, default: undefined },
    detected_at: { type: Date, default: Date.now },
  },
  subSchemaOptions,
);

const OverrideSchema = new Schema(
  {
    field: { type: String, required: true },
    previous: { type: Schema.Types.Mixed, default: null },
    next: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: null },
    by: { type: String, default: 'admin' },
    at: { type: Date, default: Date.now },
  },
  subSchemaOptions,
);

const ImageSchema = new Schema(
  {
    path: { type: String, required: true },
    url: { type: String, default: null },
    is_primary: { type: Boolean, default: false },
    source: { type: String, default: null },
  },
  subSchemaOptions,
);

const MetadataSchema = new Schema(
  {
    source_catalog: { type: String, default: null },
    source_sheet: { type: String, default: null },
    source_row: { type: Number, default: null },
    source_type: { type: String, default: null },
    import_run: { type: Schema.Types.ObjectId, ref: 'ImportRun', default: null },

    last_updated: { type: Date, default: Date.now },
    last_imported_at: { type: Date, default: null },

    data_quality_score: { type: Number, default: 0, min: 0, max: 100 },
    quality_breakdown: { type: Schema.Types.Mixed, default: undefined },
    completeness: { type: Number, default: 0, min: 0, max: 100 },
    mapping_confidence: { type: Number, default: null, min: 0, max: 1 },

    /**
     * Dotted paths an admin has edited by hand. Re-imports must never
     * overwrite these — that is what makes manual corrections durable.
     */
    locked_fields: { type: [String], default: [] },
    overrides: { type: [OverrideSchema], default: [] },

    /**
     * Provenance flags produced by the ingestion pipeline. These must be
     * declared: Mongoose silently drops undeclared paths, and the validator
     * re-reads them on every rescore to decide whether to raise
     * COST_MISMATCH, GENERATED_SKU and friends.
     */
    sku_generated: { type: Boolean, default: false },
    sku_corrected: { type: String, default: null },
    sku_ambiguous: { type: Boolean, default: false },
    category_unmapped: { type: Boolean, default: false },
    brand_multi: { type: Boolean, default: false },
    cost_mismatch: { type: Schema.Types.Mixed, default: null },
    unmapped_columns: { type: [String], default: [] },
    duplicate_sources: { type: Schema.Types.Mixed, default: undefined },

    /** Figures reported by the source that we recompute rather than trust. */
    reported_margin: { type: Number, default: null },
    extended_cost: { type: Number, default: null },

    /** Verbatim source row, so any mapping mistake stays recoverable. */
    raw: { type: Schema.Types.Mixed, default: undefined },
    notes: { type: [String], default: [] },
  },
  subSchemaOptions,
);

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    name_key: { type: String, index: true },
    slug: { type: String },

    brand: { type: String, default: null, trim: true },
    brand_key: { type: String, default: null, index: true },

    sku: { type: String, default: null, trim: true },
    sku_key: { type: String, default: null },
    alternate_skus: { type: [String], default: [] },

    category: { type: String, default: null, trim: true },
    subcategory: { type: String, default: null, trim: true },
    category_path: { type: [String], default: [] },
    tags: { type: [String], default: [] },

    description: {
      short: { type: String, default: null },
      long: { type: String, default: null },
    },

    pricing: { type: PricingSchema, default: () => ({}) },
    specs: { type: SpecsSchema, default: () => ({}) },
    inventory: { type: InventorySchema, default: () => ({}) },
    status: { type: StatusSchema, default: () => ({}) },
    metadata: { type: MetadataSchema, default: () => ({}) },

    images: { type: [ImageSchema], default: [] },
    issues: { type: [IssueSchema], default: [] },

    /** Stable dedupe key: sku_key when present, otherwise brand+name digest. */
    fingerprint: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true, transform: (_doc, ret) => { delete ret.id; return ret; } },
    toObject: { virtuals: true },
  },
);

/* ------------------------------- indexes -------------------------------- */

// Deliberately NOT unique. Suppliers really do reuse one model code for two
// different products (Joyroom JR-ZS259 and SA21-1T3 both do, and their own
// price list documents it). A unique index would make the real catalog
// unstorable, so duplicate SKUs are reported as data-quality issues instead.
ProductSchema.index({ sku_key: 1 });

// Idempotency anchor: re-running an import updates rather than duplicates.
ProductSchema.index({ fingerprint: 1 }, { unique: true });

/**
 * Slugs are product URLs on the storefront, so two products sharing one would
 * make the second unreachable. Unique and partial: rows imported before slugs
 * existed may have none, and a null must not collide with another null.
 */
ProductSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } },
);
ProductSchema.index({ category: 1, brand: 1 });
ProductSchema.index({ 'status.is_active': 1, 'status.is_verified': 1 });
ProductSchema.index({ 'pricing.margin_percentage': 1 });
ProductSchema.index({ 'metadata.data_quality_score': -1 });
ProductSchema.index({ 'metadata.source_catalog': 1 });
ProductSchema.index({ 'issues.code': 1 });
ProductSchema.index({ name: 'text', brand: 'text', sku: 'text', 'description.short': 'text' });

/* ------------------------------- virtuals ------------------------------- */

// Delegates rather than restating the rule: PUBLISHED_FILTER is the query-side
// half of the same contract, and the two drifting apart is how a product the
// storefront lists stops matching the product the storefront can find.
ProductSchema.virtual('is_publishable').get(function publishable() {
  return isPublishable(this);
});

/* -------------------------------- hooks --------------------------------- */

ProductSchema.pre('validate', function normaliseKeys(next) {
  if (this.name) {
    this.name_key = normalizeKey(this.name);
    if (!this.slug) this.slug = slugify(this.name);
  }
  this.brand_key = this.brand ? normalizeKey(this.brand) : null;
  this.sku_key = skuKey(this.sku);
  this.fingerprint = computeFingerprint({ sku: this.sku, brand: this.brand, name: this.name });

  if (this.metadata) this.metadata.last_updated = new Date();
  next();
});

export { computeFingerprint };

export const Product = mongoose.models.Product ?? mongoose.model('Product', ProductSchema);

export default Product;
