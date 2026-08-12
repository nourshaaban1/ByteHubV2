/**
 * What it means for a product to be sellable, in one place.
 *
 * This contract was previously written out three times — as a Mongoose virtual,
 * as the storefront's query filter, and as the publish script's candidate
 * filter — which is three chances for them to disagree about which products a
 * customer may see. They are derived from one base here instead.
 *
 * Deliberately free of imports: the model imports this, so anything imported
 * back would be a cycle.
 */

/**
 * On the shelf, verification aside: active, not a draft, and actually priced.
 *
 * The price guard belongs in the contract rather than in the UI — a verified
 * product with no selling price renders as a card with a blank price tag,
 * which is not a product a shop is offering.
 */
export const SELLABLE_FILTER = Object.freeze({
  'status.is_active': true,
  'status.is_draft': { $ne: true },
  'pricing.selling_price': { $gt: 0 },
});

/** Cleared for the storefront. The only filter the public API ever applies. */
export const PUBLISHED_FILTER = Object.freeze({
  ...SELLABLE_FILTER,
  'status.is_verified': true,
});

/**
 * Sellable but not yet signed off — the queue the publish script works through.
 *
 * `$ne: true` rather than `false` on purpose. On an imported product the field
 * is often absent: the importer treats `status.is_verified` as admin-owned and
 * strips it from its update, so historically nothing ever wrote the initial
 * `false`. Equality matching finds none of those documents.
 */
export const AWAITING_VERIFICATION_FILTER = Object.freeze({
  ...SELLABLE_FILTER,
  'status.is_verified': { $ne: true },
});

/** The same test against an in-memory product, for code holding a document. */
export function isPublishable(product) {
  const price = product?.pricing?.selling_price;

  return (
    product?.status?.is_active === true &&
    product?.status?.is_verified === true &&
    product?.status?.is_draft !== true &&
    Number.isFinite(price) &&
    price > 0
  );
}

export default { SELLABLE_FILTER, PUBLISHED_FILTER, AWAITING_VERIFICATION_FILTER, isPublishable };
