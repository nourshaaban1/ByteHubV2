import { cleanText, normalizeKey } from '../../../shared/utils/text.js';

export const ROW_TYPES = Object.freeze({
  EMPTY: 'empty',
  TITLE: 'title',
  SECTION: 'section',
  HEADER: 'header',
  TOTAL: 'total',
  DATA: 'data',
});

const TOTAL_TOKENS = [
  'total', 'totals', 'grand total', 'subtotal', 'sum',
  'الإجمالي', 'المجموع', 'اجمالي',
];

const NOTE_PREFIXES = [
  'note:', 'notes:', 'source:', 'legend:', 'disclaimer:', 'ملاحظة:',
];

const filled = (cells) => cells.filter((cell) => cell !== null && cell !== undefined && cell !== '');

const isNumericish = (cell) =>
  typeof cell === 'number' || (typeof cell === 'string' && /^[\d\s,.\-–%$]+$/.test(cell.trim()));

/**
 * Classifies one spreadsheet row. ByteHub's real sheets interleave banner
 * text, ALL-CAPS section dividers ("CHARGING & DATA CABLES") and TOTAL rows
 * with actual products, so every row is triaged before mapping.
 *
 * @param {{index:number, cells:Array}} row
 * @param {{ headerIndex?:number, width?:number }} context
 */
export function classifyRow(row, context = {}) {
  const cells = row.cells ?? [];
  const present = filled(cells);

  if (present.length === 0) return { type: ROW_TYPES.EMPTY };

  if (context.headerIndex !== undefined && row.index === context.headerIndex) {
    return { type: ROW_TYPES.HEADER };
  }

  const texts = present.filter((cell) => typeof cell === 'string');
  const joined = cleanText(texts.join(' ')).toLowerCase();

  // TOTAL rows: a total token plus (usually) one number, and never a full row.
  const hasTotalToken = texts.some((cell) => {
    const key = normalizeKey(cell);
    return TOTAL_TOKENS.includes(key);
  });
  if (hasTotalToken && present.length <= Math.max(3, Math.ceil((context.width ?? cells.length) / 3))) {
    return { type: ROW_TYPES.TOTAL };
  }

  // Section divider: exactly one non-empty cell, in the first few columns,
  // that reads like a label rather than a sentence.
  if (present.length === 1) {
    const firstIndex = cells.findIndex((cell) => cell !== null && cell !== '');
    const value = cells[firstIndex];

    if (typeof value !== 'string') return { type: ROW_TYPES.EMPTY };

    const text = cleanText(value);
    const isBeforeHeader = context.headerIndex !== undefined && row.index < context.headerIndex;
    const looksLikeNote = NOTE_PREFIXES.some((prefix) => joined.startsWith(prefix));
    const isLong = text.length > 90 || text.split(' ').length > 12;

    if (isBeforeHeader || looksLikeNote || isLong) {
      return { type: ROW_TYPES.TITLE, text };
    }
    if (firstIndex <= 1) {
      return { type: ROW_TYPES.SECTION, text };
    }
    return { type: ROW_TYPES.TITLE, text };
  }

  // Two cells where the first is a bullet/marker and the second is prose.
  if (present.length === 2 && texts.length === 2) {
    const [first, second] = texts;
    if (cleanText(first).length <= 2 && cleanText(second).length > 60) {
      return { type: ROW_TYPES.TITLE, text: cleanText(second) };
    }
  }

  // Rows before the header that are not a section divider are banner text.
  if (context.headerIndex !== undefined && row.index < context.headerIndex) {
    return { type: ROW_TYPES.TITLE, text: cleanText(texts.join(' ')) };
  }

  // A row of only numbers with no text is a stray calculation, not a product.
  if (texts.length === 0 && present.every(isNumericish)) {
    return { type: ROW_TYPES.TOTAL };
  }

  return { type: ROW_TYPES.DATA };
}

export default classifyRow;
