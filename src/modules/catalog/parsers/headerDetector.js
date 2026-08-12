import { matchHeader } from './columnMapper.js';
import { cleanText } from '../../../shared/utils/text.js';

export const DEFAULT_SCAN_DEPTH = 20;
const MIN_MAPPED_COLUMNS = 2;

/** Fields whose presence strongly implies "this row is the header". */
const ANCHOR_FIELDS = new Set([
  'name', 'sku', 'supplier_sku', 'brand', 'category',
  'rdp', 'rrp', 'selling_price', 'quantity',
]);

function scoreRow(cells) {
  const filled = cells.filter((cell) => cell !== null && cell !== '');
  if (filled.length < MIN_MAPPED_COLUMNS) return null;

  let mapped = 0;
  let anchors = 0;
  let numeric = 0;
  let longText = 0;
  const fields = [];

  for (const cell of filled) {
    if (typeof cell === 'number') {
      numeric += 1;
      continue;
    }
    const text = cleanText(cell);
    // A header cell is a label, not a sentence.
    if (text.length > 60 || text.split(' ').length > 10) {
      longText += 1;
      continue;
    }
    const match = matchHeader(text);
    if (match && match.confidence >= 0.8) {
      mapped += 1;
      fields.push(match.field);
      if (ANCHOR_FIELDS.has(match.field)) anchors += 1;
    }
  }

  if (mapped < MIN_MAPPED_COLUMNS) return null;

  const score = mapped * 3 + anchors * 2 + filled.length * 0.25 - numeric * 2 - longText * 3;
  return { score, mapped, anchors, fields, filled: filled.length };
}

/**
 * Finds the header row of a sheet.
 *
 * ByteHub's workbooks put the header at row 1, 2, 3 or 4 depending on how many
 * banner lines the author added, so the position is discovered rather than
 * assumed. Returns null when a sheet carries no tabular data at all
 * (the "Overview" and "Negotiation & KPIs" sheets are prose).
 *
 * @param {{rows: Array<{index:number, cells:Array}>}} sheet
 * @returns {{ index:number, cells:Array, score:number, fields:string[] } | null}
 */
export function detectHeaderRow(sheet, { scanDepth = DEFAULT_SCAN_DEPTH } = {}) {
  const candidates = [];

  for (const row of sheet.rows.slice(0, scanDepth)) {
    const scored = scoreRow(row.cells);
    if (!scored) continue;
    candidates.push({ index: row.index, cells: row.cells, ...scored });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const winner = candidates[0];

  // A header with no anchor field is almost certainly a summary block
  // ("Basket | # of SKUs | Total Cost") rather than a product table.
  if (winner.anchors === 0 && winner.mapped < 3) return null;

  return winner;
}

export default detectHeaderRow;
