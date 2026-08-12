/**
 * Shapes a stored product into the only view a customer is ever allowed to see.
 *
 * This is an allowlist on purpose. The product document carries dealer cost
 * (`pricing.rdp`), computed margins, supplier names, data-quality issues and a
 * verbatim copy of the source spreadsheet row — all of it commercially
 * sensitive, none of it a customer's business. A denylist would leak every new
 * internal field the moment someone adds one; building the payload field by
 * field means a new internal field stays internal by default.
 */

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const clean = (value) => (value === undefined ? null : value);

/**
 * Customer-facing price.
 *
 * The storefront is an Egyptian shop quoting Egyptian pounds, so the figure we
 * publish is the normalised one — the USD-priced generic catalog has already
 * been converted by the pricing module. Where normalisation did not happen we
 * fall back to the raw figure and publish the currency it is actually in,
 * rather than mislabelling dollars as pounds.
 *
 * `rdp`, `margin_*`, `market_*` and the range/estimate provenance in `detail`
 * are deliberately absent.
 */
function toPrice(pricing = {}) {
  const normalized = pricing.normalized ?? {};

  const amount = isFiniteNumber(normalized.selling_price)
    ? normalized.selling_price
    : pricing.selling_price;

  const currency = isFiniteNumber(normalized.selling_price)
    ? (normalized.currency ?? 'EGP')
    : (pricing.currency ?? null);

  return {
    amount: isFiniteNumber(amount) ? amount : null,
    currency,
    // Surfaced so the UI can label a parsed-from-a-range price as approximate
    // instead of quoting it as if the shop had committed to it.
    is_estimated: pricing.is_estimated === true,
  };
}

/**
 * Specs, minus the empty ones.
 *
 * A spec table that lists "Battery capacity: —" for a cable is noise, so
 * anything the catalog does not know about is dropped rather than rendered
 * blank. `attributes` is a Mongo Map: after `.lean()` it is a plain object,
 * but a hydrated document hands back a real Map, so both are handled.
 */
function toSpecs(specs = {}) {
  const {
    power_wattage: powerWattage,
    cable_type: cableType,
    compatibility,
    battery_capacity: batteryCapacity,
    capacity,
    capacity_gb: capacityGb,
    interface: interfaceName,
    form_factor: formFactor,
    length_m: lengthM,
    color,
    warranty_months: warrantyMonths,
    condition,
    features,
    attributes,
  } = specs;

  const scalars = {
    power_wattage: powerWattage,
    cable_type: cableType,
    battery_capacity: batteryCapacity,
    capacity,
    capacity_gb: capacityGb,
    interface: interfaceName,
    form_factor: formFactor,
    length_m: lengthM,
    color,
    warranty_months: warrantyMonths,
    // 'unknown' is the schema default, not a fact about the product.
    condition: condition && condition !== 'unknown' ? condition : null,
  };

  const output = {};
  for (const [key, value] of Object.entries(scalars)) {
    if (value !== null && value !== undefined && value !== '') output[key] = value;
  }

  if (Array.isArray(compatibility) && compatibility.length > 0) output.compatibility = compatibility;
  if (Array.isArray(features) && features.length > 0) output.features = features;

  const extra = attributes instanceof Map ? Object.fromEntries(attributes) : attributes;
  if (extra && typeof extra === 'object' && Object.keys(extra).length > 0) {
    output.attributes = extra;
  }

  return output;
}

/**
 * Image URLs only.
 *
 * `path` and `source` describe where the file sits on the server and which
 * catalog folder it was matched from; neither means anything to a customer.
 * The primary image is hoisted to the front so a card can just take [0].
 */
function toImages(images = []) {
  const usable = images
    .filter((image) => image && (image.url || image.path))
    .map((image) => ({
      url: image.url ?? `/${image.path}`,
      is_primary: image.is_primary === true,
    }));

  return [...usable].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
}

/** Whether we can sell one today — never the exact count, never the supplier. */
function toAvailability(inventory = {}) {
  const quantity = isFiniteNumber(inventory.quantity) ? inventory.quantity : 0;
  const reserved = isFiniteNumber(inventory.reserved) ? inventory.reserved : 0;
  return { in_stock: quantity - reserved > 0 };
}

/** The card payload: everything a grid tile needs and nothing more. */
export function toPublicSummary(product) {
  if (!product) return null;

  return {
    id: String(product._id),
    slug: clean(product.slug),
    name: product.name,
    brand: clean(product.brand),
    sku: clean(product.sku),
    category: clean(product.category),
    subcategory: clean(product.subcategory),
    price: toPrice(product.pricing),
    image: toImages(product.images)[0]?.url ?? null,
    availability: toAvailability(product.inventory),
  };
}

/** The detail-page payload: the summary plus copy, specs and the full gallery. */
export function toPublicDetail(product) {
  if (!product) return null;

  return {
    ...toPublicSummary(product),
    category_path: product.category_path ?? [],
    tags: product.tags ?? [],
    description: {
      short: clean(product.description?.short),
      long: clean(product.description?.long),
    },
    specs: toSpecs(product.specs),
    images: toImages(product.images),
    updated_at: clean(product.updatedAt),
  };
}

export default { toPublicSummary, toPublicDetail };
