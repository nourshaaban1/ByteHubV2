import path from 'node:path';
import XLSX from 'xlsx';
import { badRequest } from '../../../shared/errors/AppError.js';

const SUPPORTED = new Set(['.xlsx', '.xlsm', '.xls', '.csv', '.tsv', '.txt']);

const toGrid = (worksheet) =>
  XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: true, // keep numbers as numbers; the cleaners handle strings
    blankrows: true, // preserved so `source_row` matches what a human sees in Excel
  });

const normaliseCell = (cell) => {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell === 'string') {
    const trimmed = cell.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof cell === 'number' && !Number.isFinite(cell)) return null;
  return cell;
};

function buildSheets(workbook, sourceName) {
  return workbook.SheetNames.map((name) => {
    const grid = toGrid(workbook.Sheets[name]).map((row) => row.map(normaliseCell));
    const width = grid.reduce((max, row) => Math.max(max, row.length), 0);

    return {
      name,
      source: sourceName,
      width,
      rows: grid.map((row, index) => ({
        // Excel's own 1-based row number, so a reported issue can be found by hand.
        index: index + 1,
        cells: Array.from({ length: width }, (_, column) => row[column] ?? null),
      })),
    };
  });
}

/** Reads a workbook from disk into a normalised grid. */
export function readWorkbookFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!SUPPORTED.has(extension)) {
    throw badRequest(`Unsupported file type '${extension}'`, {
      supported: [...SUPPORTED],
    });
  }

  const workbook = XLSX.readFile(filePath, { cellDates: true, cellNF: false, cellText: false });
  return {
    fileName: path.basename(filePath),
    filePath,
    sheets: buildSheets(workbook, path.basename(filePath)),
  };
}

/** Reads a workbook from an upload buffer. */
export function readWorkbookBuffer(buffer, fileName = 'upload.xlsx') {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  return {
    fileName,
    filePath: null,
    sheets: buildSheets(workbook, fileName),
  };
}

export const isSupportedFile = (fileName) => SUPPORTED.has(path.extname(fileName).toLowerCase());

export default { readWorkbookFile, readWorkbookBuffer, isSupportedFile };
