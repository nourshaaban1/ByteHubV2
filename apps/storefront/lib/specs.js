import { humanize } from './format.js';

/**
 * Turns the backend's spec object into labelled, unit-bearing rows.
 *
 * The backend stores bare numbers — `power_wattage: 65`, `battery_capacity:
 * 20000` — because units belong to presentation, not storage. A spec table
 * showing "Power: 65" is useless to a customer deciding between chargers, so
 * the units are attached here.
 *
 * Order is fixed and meaningful: the specs people actually compare on come
 * first, and anything the catalog carried that we have no label for is appended
 * rather than dropped.
 */
const FIELDS = [
  { key: 'power_wattage', label: 'Power output', unit: 'W' },
  { key: 'battery_capacity', label: 'Battery capacity', unit: 'mAh' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'capacity_gb', label: 'Capacity', unit: 'GB' },
  { key: 'cable_type', label: 'Connector' },
  { key: 'length_m', label: 'Length', unit: 'm' },
  { key: 'interface', label: 'Interface' },
  { key: 'form_factor', label: 'Form factor' },
  { key: 'color', label: 'Colour' },
  { key: 'condition', label: 'Condition' },
  { key: 'warranty_months', label: 'Warranty', format: (value) => `${value} months` },
  { key: 'compatibility', label: 'Works with', format: (value) => value.join(', ') },
];

const HIDDEN = new Set([...FIELDS.map((field) => field.key), 'features', 'attributes']);

export function toSpecRows(specs = {}) {
  const rows = [];

  for (const field of FIELDS) {
    const value = specs[field.key];
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;

    // `capacity` ("512GB") and `capacity_gb` (512) describe the same thing;
    // whichever came first wins so the table never lists Capacity twice.
    if (rows.some((row) => row.label === field.label)) continue;

    const text = field.format
      ? field.format(value)
      : `${value}${field.unit ? ` ${field.unit}` : ''}`;

    rows.push({ label: field.label, value: text });
  }

  for (const [key, value] of Object.entries(specs.attributes ?? {})) {
    if (HIDDEN.has(key) || value === null || value === '') continue;
    rows.push({ label: humanize(key), value: String(value) });
  }

  return rows;
}

/** Two or three headline specs for the card and the top of the detail page. */
export function toHighlights(specs = {}, limit = 3) {
  return toSpecRows(specs)
    .filter((row) => row.label !== 'Condition' && row.label !== 'Colour')
    .slice(0, limit);
}

export default { toSpecRows, toHighlights };
