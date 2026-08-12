import Product from './product.model.js';
import { toPagination, toSort } from '../../shared/utils/pagination.js';

const SORT_FIELDS = {
  name: 'name',
  brand: 'brand',
  sku: 'sku',
  category: 'category',
  price: 'pricing.selling_price',
  cost: 'pricing.rdp',
  margin: 'pricing.margin_percentage',
  quality: 'metadata.data_quality_score',
  quantity: 'inventory.quantity',
  created: 'createdAt',
  updated: 'updatedAt',
};

/**
 * Translates a validated query object into a Mongo filter.
 * Kept in the repository so services never build raw Mongo syntax.
 */
export function buildFilter(query = {}) {
  const filter = {};

  if (query.search) filter.$text = { $search: query.search };
  if (query.brand) filter.brand_key = { $in: [].concat(query.brand).map((b) => b.toLowerCase()) };
  if (query.category) filter.category = { $in: [].concat(query.category) };
  if (query.subcategory) filter.subcategory = { $in: [].concat(query.subcategory) };
  if (query.sku) filter.sku_key = String(query.sku).toLowerCase().replace(/\s+/g, '');
  if (query.supplier) filter['inventory.supplier'] = { $in: [].concat(query.supplier) };
  if (query.source_catalog) filter['metadata.source_catalog'] = { $in: [].concat(query.source_catalog) };
  if (query.currency) filter['pricing.currency'] = query.currency;
  if (query.procurement) filter['status.procurement'] = { $in: [].concat(query.procurement) };
  if (query.lifecycle) filter['status.lifecycle'] = { $in: [].concat(query.lifecycle) };

  if (query.is_active !== undefined) filter['status.is_active'] = query.is_active;
  if (query.is_verified !== undefined) filter['status.is_verified'] = query.is_verified;
  if (query.is_generic !== undefined) filter['status.is_generic'] = query.is_generic;
  if (query.is_draft !== undefined) filter['status.is_draft'] = query.is_draft;

  if (query.issue_code) filter['issues.code'] = { $in: [].concat(query.issue_code) };
  if (query.issue_severity) filter['issues.severity'] = { $in: [].concat(query.issue_severity) };
  if (query.has_issues === true) filter['issues.0'] = { $exists: true };
  if (query.has_issues === false) filter['issues.0'] = { $exists: false };

  const between = (path, min, max) => {
    if (min === undefined && max === undefined) return;
    filter[path] = {};
    if (min !== undefined) filter[path].$gte = min;
    if (max !== undefined) filter[path].$lte = max;
  };

  between('pricing.normalized.selling_price', query.min_price, query.max_price);
  between('pricing.margin_percentage', query.min_margin, query.max_margin);
  between('metadata.data_quality_score', query.min_quality, query.max_quality);
  between('inventory.quantity', query.min_quantity, query.max_quantity);

  return filter;
}

export const productRepository = {
  async findMany(query = {}) {
    const { page, limit, skip } = toPagination(query);
    const filter = buildFilter(query);
    const sort = toSort(query.sort, SORT_FIELDS, query.search ? { score: { $meta: 'textScore' } } : { updatedAt: -1 });

    const projection = query.search ? { score: { $meta: 'textScore' } } : undefined;

    // Plain .lean(): virtuals need the mongoose-lean-virtuals plugin, which is
    // not installed, so `{ virtuals: true }` here was silently doing nothing.
    // Nothing consumes `is_publishable` off a lean result — the storefront
    // filters on PUBLISHED_FILTER in the query instead.
    const [items, total] = await Promise.all([
      Product.find(filter, projection).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  },

  findById(id) {
    return Product.findById(id);
  },

  findByIdLean(id) {
    return Product.findById(id).lean();
  },

  findByFingerprint(fingerprint) {
    return Product.findOne({ fingerprint });
  },

  findBySkuKey(skuKey) {
    return Product.find({ sku_key: skuKey });
  },

  create(payload) {
    return Product.create(payload);
  },

  async insertMany(payloads, options = {}) {
    return Product.insertMany(payloads, { ordered: false, ...options });
  },

  findOneAndUpdate(filter, update, options = {}) {
    return Product.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
      ...options,
    });
  },

  deleteById(id) {
    return Product.findByIdAndDelete(id);
  },

  softDeleteById(id) {
    return Product.findByIdAndUpdate(
      id,
      { $set: { 'status.is_active': false, 'status.lifecycle': 'archived' } },
      { new: true },
    );
  },

  count(filter = {}) {
    return Product.countDocuments(filter);
  },

  aggregate(pipeline) {
    return Product.aggregate(pipeline);
  },

  bulkWrite(operations, options = {}) {
    if (operations.length === 0) return Promise.resolve({ ok: 1, nUpserted: 0, nModified: 0 });
    return Product.bulkWrite(operations, { ordered: false, ...options });
  },

  /** Distinct SKU keys that are attached to more than one product document. */
  duplicateSkuGroups() {
    return Product.aggregate([
      { $match: { sku_key: { $type: 'string', $ne: '' } } },
      {
        $group: {
          _id: '$sku_key',
          count: { $sum: 1 },
          products: {
            $push: { _id: '$_id', name: '$name', brand: '$brand', sku: '$sku', source: '$metadata.source_catalog' },
          },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);
  },

  SORT_FIELDS,
};

export default productRepository;
