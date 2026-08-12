export const SEVERITY = Object.freeze({
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
});

/**
 * Central issue registry. Every detector references a code here so the API,
 * the quality score and the README all stay in sync.
 *
 * `penalty` is subtracted from the 0-100 data_quality_score, which starts from
 * weighted field completeness. The two halves measure different things and
 * must not double-charge for one fact: a field that is merely *absent* is
 * already priced into completeness, so its penalty is 0. Penalties are
 * reserved for data that is present and *wrong* (duplicates, loss-making
 * prices, mismatched costs) plus the few absences that block a sale outright.
 */
export const ISSUES = Object.freeze({
  MISSING_NAME: { severity: SEVERITY.CRITICAL, penalty: 25, message: 'Product has no usable name' },
  MISSING_SKU: { severity: SEVERITY.HIGH, penalty: 0, message: 'No supplier SKU / model code' },
  GENERATED_SKU: { severity: SEVERITY.LOW, penalty: 4, message: 'SKU was auto-generated, not supplied' },
  DUPLICATE_SKU: { severity: SEVERITY.CRITICAL, penalty: 25, message: 'SKU is used by another product' },
  AMBIGUOUS_SKU: { severity: SEVERITY.HIGH, penalty: 15, message: 'Supplier reuses this model code for more than one product' },
  SKU_CORRECTED: { severity: SEVERITY.INFO, penalty: 0, message: 'SKU was corrected during import' },
  DUPLICATE_PRODUCT: { severity: SEVERITY.HIGH, penalty: 15, message: 'Near-identical product exists in another catalog' },

  MISSING_BRAND: { severity: SEVERITY.MEDIUM, penalty: 0, message: 'No brand recorded' },
  MISSING_CATEGORY: { severity: SEVERITY.MEDIUM, penalty: 0, message: 'No category recorded' },
  UNMAPPED_CATEGORY: { severity: SEVERITY.LOW, penalty: 4, message: 'Category did not match the taxonomy and was kept verbatim' },

  MISSING_COST: { severity: SEVERITY.CRITICAL, penalty: 10, message: 'No RDP (wholesale cost) — margin cannot be computed' },
  MISSING_SELLING_PRICE: { severity: SEVERITY.CRITICAL, penalty: 10, message: 'No selling price — product cannot be sold' },
  MISSING_CURRENCY: { severity: SEVERITY.HIGH, penalty: 5, message: 'Currency unknown — price is not comparable' },
  ESTIMATED_PRICE: { severity: SEVERITY.MEDIUM, penalty: 8, message: 'Price is an estimate or a range, not a quoted figure' },
  PRICE_RANGE_ONLY: { severity: SEVERITY.MEDIUM, penalty: 8, message: 'Only a price range was supplied; midpoint used' },
  NEGATIVE_PRICE: { severity: SEVERITY.CRITICAL, penalty: 25, message: 'Price is negative' },
  SELLING_BELOW_COST: { severity: SEVERITY.CRITICAL, penalty: 25, message: 'Selling price is below wholesale cost — every unit loses money' },
  MARKET_BELOW_COST: { severity: SEVERITY.CRITICAL, penalty: 20, message: 'Assumed market price is below wholesale cost' },
  LOW_MARGIN: { severity: SEVERITY.HIGH, penalty: 10, message: 'Margin is below the configured warning threshold' },
  CRITICAL_MARGIN: { severity: SEVERITY.CRITICAL, penalty: 18, message: 'Margin is below the configured critical threshold' },
  IMPLAUSIBLE_MARGIN: { severity: SEVERITY.HIGH, penalty: 12, message: 'Margin is implausibly high — likely a unit or currency error' },
  RRP_BELOW_COST: { severity: SEVERITY.HIGH, penalty: 15, message: 'RRP is below RDP' },
  COST_MISMATCH: { severity: SEVERITY.HIGH, penalty: 12, message: 'Cost disagrees with the verified supplier price list' },

  MISSING_SPECS: { severity: SEVERITY.LOW, penalty: 0, message: 'No technical specs captured' },
  MISSING_QUANTITY: { severity: SEVERITY.LOW, penalty: 0, message: 'No stock quantity recorded' },
  MISSING_SUPPLIER: { severity: SEVERITY.MEDIUM, penalty: 0, message: 'No supplier recorded' },
  MISSING_IMAGES: { severity: SEVERITY.LOW, penalty: 0, message: 'No product images linked' },

  GENERIC_ITEM: { severity: SEVERITY.MEDIUM, penalty: 10, message: 'Placeholder / generic item rather than a real SKU' },
  DRAFT_ITEM: { severity: SEVERITY.MEDIUM, penalty: 10, message: 'Marked as a draft in the source catalog' },
  UNPARSED_COLUMNS: { severity: SEVERITY.INFO, penalty: 0, message: 'Some source columns could not be mapped and were kept as raw attributes' },
});

export const issueCodes = Object.keys(ISSUES);

export function buildIssue(code, overrides = {}) {
  const definition = ISSUES[code];
  if (!definition) {
    return { code, severity: SEVERITY.INFO, message: code, penalty: 0, ...overrides };
  }
  return {
    code,
    severity: definition.severity,
    message: definition.message,
    penalty: definition.penalty,
    ...overrides,
  };
}

export default { ISSUES, SEVERITY, issueCodes, buildIssue };
