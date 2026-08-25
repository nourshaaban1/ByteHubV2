/**
 * Read-only catalog for the customer storefront.
 *
 * Every query here is anchored to PUBLISHED_FILTER, which is applied by the
 * server and cannot be relaxed by a query parameter. The storefront is a public
 * surface: leaving "only show verified, active products" to the client would
 * mean anyone could list the shop's unverified, half-imported rows by editing a
 * URL. The filter lives here so that is simply not expressible.
 */
import Product from '../product.model.js';
import { notFound } from '../../../shared/errors/AppError.js';
import { PUBLISHED_FILTER } from '../product.publishable.js';
import { TAXONOMY } from '../../catalog/config/taxonomy.js';
import { toPublicSummary, toPublicDetail } from './public.serializer.js';

/**
 * Categories the shop is willing to put in its navigation.
 *
 * When the category cell of a source row holds a product description rather
 * than a category, the importer cannot map it and keeps the raw text — which
 * is how "Joyroom stylus pen" ended up offered as a category to customers.
 * Facets are restricted to the real taxonomy so a bad import can never shape
 * the storefront's navigation. The products themselves stay listed and
 * searchable; they just do not invent a category to sit under.
 */
const TAXONOMY_CATEGORIES = TAXONOMY.map((entry) => entry.category);

export const MAX_LIMIT = 60;
export const DEFAULT_LIMIT = 24;

export { PUBLISHED_FILTER };

const SORTS = {
  // Data-quality score is never shown to a customer, but ordering by it puts
  // the products with real photos, specs and descriptions at the top, which is
  // exactly what a storefront wants on an unsorted grid.
  featured: { 'metadata.data_quality_score': -1, updatedAt: -1 },
  price_asc: { 'pricing.normalized.selling_price': 1, _id: 1 },
  price_desc: { 'pricing.normalized.selling_price': -1, _id: 1 },
  name: { name: 1 },
  newest: { createdAt: -1 },
};

export const SORT_KEYS = Object.keys(SORTS);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Customer search across name, brand and SKU.
 *
 * The model has a text index, but `$text` matches whole words only — someone
 * typing "char" gets nothing until they finish "charger", which is the opposite
 * of the instant search this is for. A case-insensitive substring match gives
 * true as-you-type behaviour, and the published catalog is small enough that
 * the cost is irrelevant. Input is escaped so a stray "(" is a character to
 * search for, not a regex the customer accidentally wrote.
 */
function searchClause(term) {
  const pattern = new RegExp(escapeRegex(term.trim()), 'i');
  return { $or: [{ name: pattern }, { brand: pattern }, { sku: pattern }] };
}

/** Composes the customer's filters on top of the non-negotiable base filter. */
export function buildPublicFilter(query = {}) {
  const conditions = [PUBLISHED_FILTER];

  if (query.search) conditions.push(searchClause(query.search));
  if (query.category?.length) conditions.push({ category: { $in: query.category } });
  if (query.subcategory?.length) conditions.push({ subcategory: { $in: query.subcategory } });

  if (query.brand?.length) {
    conditions.push({ brand_key: { $in: query.brand.map((brand) => brand.toLowerCase()) } });
  }

  // Price filters run against the normalised figure because that is the number
  // the storefront displays; filtering on the raw one would drop USD-priced
  // products out of an EGP range that they actually fall inside.
  const price = {};
  if (query.min_price !== undefined) price.$gte = query.min_price;
  if (query.max_price !== undefined) price.$lte = query.max_price;
  if (Object.keys(price).length > 0) {
    conditions.push({ 'pricing.normalized.selling_price': price });
  }

  if (query.in_stock === true) conditions.push({ 'inventory.quantity': { $gt: 0 } });
  if (query.has_image === true) conditions.push({ 'images.0': { $exists: true } });

  return conditions.length === 1 ? { ...PUBLISHED_FILTER } : { $and: conditions };
}

export const publicService = {
  async list(query = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
    const filter = buildPublicFilter(query);
    const sort = SORTS[query.sort] ?? SORTS.featured;

    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return { items: items.map(toPublicSummary), total, page, limit };
  },

  /**
   * Looks a product up by slug, falling back to its id.
   *
   * Slugs are what the storefront puts in its URLs — an ObjectId in a product
   * link is unreadable, unshareable and carries none of the keywords a search
   * engine ranks on. Ids still resolve so older links and QR codes keep working.
   */
  async getByHandle(handle) {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(handle);
    const match = isObjectId ? { $or: [{ slug: handle }, { _id: handle }] } : { slug: handle };

    const product = await Product.findOne({ ...match, ...PUBLISHED_FILTER }).lean();
    // A product that exists but is not published is reported as absent rather
    // than forbidden: "this handle is unverified" is itself information about
    // the shop's internal state.
    if (!product) throw notFound('Product', handle);
    return toPublicDetail(product);
  },

  /** Every published slug, for the sitemap. */
  async allHandles() {
    const products = await Product.find(PUBLISHED_FILTER)
      .select('slug updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    return products
      .filter((product) => product.slug)
      .map((product) => ({ slug: product.slug, updated_at: product.updatedAt }));
  },

  /**
   * Filter options, counted over the published catalog only.
   *
   * The storefront builds its category and brand filters from this rather than
   * from a hardcoded list, so a filter can never offer a choice that returns an
   * empty grid, and a newly imported brand appears without a frontend change.
   */
  async facets() {
    const [categories, brands, priceRange, total] = await Promise.all([
      Product.aggregate([
        { $match: { ...PUBLISHED_FILTER, category: { $in: TAXONOMY_CATEGORIES } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      Product.aggregate([
        { $match: { ...PUBLISHED_FILTER, brand: { $type: 'string', $ne: '' } } },
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      Product.aggregate([
        { $match: { ...PUBLISHED_FILTER, 'pricing.normalized.selling_price': { $gt: 0 } } },
        {
          $group: {
            _id: null,
            min: { $min: '$pricing.normalized.selling_price' },
            max: { $max: '$pricing.normalized.selling_price' },
          },
        },
      ]),
      Product.countDocuments(PUBLISHED_FILTER),
    ]);

    const range = priceRange[0] ?? {};

    return {
      categories: categories.map((entry) => ({ name: entry._id, count: entry.count })),
      brands: brands.map((entry) => ({ name: entry._id, count: entry.count })),
      price: {
        min: Number.isFinite(range.min) ? Math.floor(range.min) : null,
        max: Number.isFinite(range.max) ? Math.ceil(range.max) : null,
      },
      currency: 'EGP',
      // Every published product, including the ones the import left without a
      // category — those are missing from `categories` but still on the shelf.
      total,
    };
  },
};

export default publicService;
