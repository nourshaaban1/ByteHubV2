import { slugify } from '../../shared/utils/text.js';

/**
 * Assigns each product a URL slug that no other product holds.
 *
 * A slug is a product's address on the storefront, so two products sharing one
 * would leave the second unreachable — and the database now refuses it outright
 * via a unique index. Collisions are not hypothetical: the archive catalogs
 * describe the same product in several sheets under one Arabic name but
 * different supplier codes, which slugify identically.
 *
 * The first claimant keeps the clean slug. A later one is disambiguated with
 * its SKU, which is already unique, then with a counter if even that repeats.
 * Ownership is tracked by fingerprint so a product re-importing over itself
 * keeps the slug it already had rather than suffixing on every run.
 *
 * @param {Array<{slug?:string, name:string, sku?:string, fingerprint:string}>} drafts
 * @param {{ reservedBy?: Map<string, string> }} options
 *        `reservedBy` maps an already-taken slug to the fingerprint holding it.
 * @returns {Array<{fingerprint:string, from:string, to:string}>} the changes made
 */
export function resolveSlugConflicts(drafts, { reservedBy = new Map() } = {}) {
  const owners = new Map(reservedBy);
  const changes = [];

  for (const draft of drafts) {
    const wanted = draft.slug || slugify(draft.name);
    const owner = owners.get(wanted);

    if (!owner || owner === draft.fingerprint) {
      draft.slug = wanted;
      owners.set(wanted, draft.fingerprint);
      continue;
    }

    const base = slugify(`${draft.name} ${draft.sku ?? ''}`.trim()) || wanted;
    let candidate = base;
    let suffix = 2;
    while (owners.has(candidate) && owners.get(candidate) !== draft.fingerprint) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    changes.push({ fingerprint: draft.fingerprint, from: wanted, to: candidate });
    draft.slug = candidate;
    owners.set(candidate, draft.fingerprint);
  }

  return changes;
}

/**
 * Reads which of these slugs are already taken, and by which product.
 *
 * Passed to `resolveSlugConflicts` so a new import cannot steal the URL of a
 * product that is already published under it.
 */
export async function reservedSlugs(Product, slugs) {
  if (slugs.length === 0) return new Map();

  const existing = await Product.find({ slug: { $in: slugs } })
    .select('slug fingerprint')
    .lean();

  return new Map(existing.map((product) => [product.slug, product.fingerprint]));
}

export default { resolveSlugConflicts, reservedSlugs };
