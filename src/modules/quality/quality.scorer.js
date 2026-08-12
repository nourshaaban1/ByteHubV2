import { ISSUES, SEVERITY, buildIssue } from '../../shared/constants/issues.js';
import { round } from '../../shared/utils/money.js';

/**
 * Field weights for the completeness half of the score. Data-driven so a new
 * category or a change in what "complete" means is a config edit, not a rewrite.
 * Weights sum to 100.
 */
export const FIELD_WEIGHTS = Object.freeze({
  identity: {
    weight: 35,
    fields: {
      name: { weight: 12, get: (p) => p.name },
      brand: { weight: 8, get: (p) => p.brand },
      sku: { weight: 10, get: (p) => p.sku },
      category: { weight: 5, get: (p) => p.category },
    },
  },
  pricing: {
    weight: 32,
    fields: {
      currency: { weight: 5, get: (p) => p.pricing?.currency },
      rdp: { weight: 11, get: (p) => p.pricing?.rdp },
      selling_price: { weight: 11, get: (p) => p.pricing?.selling_price },
      market: { weight: 5, get: (p) => p.pricing?.market_low ?? p.pricing?.market_high },
    },
  },
  specs: {
    weight: 15,
    fields: {
      any_spec: { weight: 8, get: (p) => countSpecs(p) || null },
      condition: { weight: 3, get: (p) => (p.specs?.condition && p.specs.condition !== 'unknown' ? p.specs.condition : null) },
      description: { weight: 4, get: (p) => p.description?.short ?? p.description?.long },
    },
  },
  commercial: {
    weight: 10,
    fields: {
      supplier: { weight: 6, get: (p) => p.inventory?.supplier },
      quantity: { weight: 4, get: (p) => (Number.isFinite(p.inventory?.quantity) && p.inventory.quantity > 0 ? p.inventory.quantity : null) },
    },
  },
  media: {
    weight: 8,
    fields: {
      images: { weight: 8, get: (p) => (p.images?.length ? p.images.length : null) },
    },
  },
});

function countSpecs(product) {
  const specs = product.specs ?? {};
  const typed = [
    specs.power_wattage,
    specs.cable_type,
    specs.battery_capacity,
    specs.capacity,
    specs.interface,
    specs.form_factor,
    specs.length_m,
    specs.color,
    specs.warranty_months,
  ].filter((value) => value !== null && value !== undefined && value !== '').length;

  const compat = Array.isArray(specs.compatibility) ? specs.compatibility.length : 0;
  const features = Array.isArray(specs.features) ? specs.features.length : 0;

  const attributes = specs.attributes;
  const attrCount = attributes instanceof Map ? attributes.size : Object.keys(attributes ?? {}).length;

  return typed + (compat > 0 ? 1 : 0) + (features > 0 ? 1 : 0) + attrCount;
}

const isPresent = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

/** Weighted completeness, 0-100, with a per-group breakdown for the API. */
export function computeCompleteness(product) {
  const groups = {};
  let earned = 0;
  let possible = 0;

  for (const [groupName, group] of Object.entries(FIELD_WEIGHTS)) {
    const missing = [];
    let groupEarned = 0;
    let groupPossible = 0;

    for (const [fieldName, field] of Object.entries(group.fields)) {
      groupPossible += field.weight;
      if (isPresent(field.get(product))) groupEarned += field.weight;
      else missing.push(fieldName);
    }

    groups[groupName] = {
      earned: round(groupEarned, 1),
      possible: groupPossible,
      pct: groupPossible > 0 ? round((groupEarned / groupPossible) * 100, 1) : 0,
      missing,
    };
    earned += groupEarned;
    possible += groupPossible;
  }

  return {
    score: possible > 0 ? round((earned / possible) * 100, 1) : 0,
    groups,
  };
}

/** Penalty total, de-duplicated by issue code so one code can't be charged twice. */
export function computePenalties(issues = []) {
  const seen = new Map();
  for (const issue of issues) {
    const code = issue?.code;
    if (!code || seen.has(code)) continue;
    const penalty = Number.isFinite(issue.penalty) ? issue.penalty : ISSUES[code]?.penalty ?? 0;
    seen.set(code, penalty);
  }
  const applied = [...seen.entries()].map(([code, penalty]) => ({ code, penalty }));
  return {
    total: applied.reduce((sum, entry) => sum + entry.penalty, 0),
    applied,
  };
}

/**
 * The 0-100 data_quality_score.
 * completeness - penalties, clamped, with a breakdown the admin UI can render.
 */
export function scoreProduct(product, issues = product?.issues ?? []) {
  const completeness = computeCompleteness(product);
  const penalties = computePenalties(issues);
  const score = Math.max(0, Math.min(100, round(completeness.score - penalties.total, 1)));

  const bySeverity = issues.reduce((acc, issue) => {
    const severity = issue?.severity ?? SEVERITY.INFO;
    acc[severity] = (acc[severity] ?? 0) + 1;
    return acc;
  }, {});

  return {
    score,
    grade: gradeFor(score),
    completeness: completeness.score,
    breakdown: {
      completeness: completeness.groups,
      penalty_total: round(penalties.total, 1),
      penalties: penalties.applied,
      issues_by_severity: bySeverity,
      blocking: issues.some((issue) => issue?.severity === SEVERITY.CRITICAL),
    },
  };
}

export function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export { buildIssue };

export default { scoreProduct, computeCompleteness, computePenalties, gradeFor, FIELD_WEIGHTS };
