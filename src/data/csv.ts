/**
 * CSV import. Accepts plain multi-column numeric CSVs (with or without a
 * header row). Two ways to turn a parsed file into HCS dimensions:
 *  - "columns" mode: each numeric column is a dimension (multivariate data,
 *    e.g. multi-channel EEG).
 *  - "embed" mode: one chosen column is lag-embedded into `dims` dimensions
 *    (phase-portrait style, for single time series).
 */

import Papa from 'papaparse';
import { lagEmbed, type Dataset } from './demos';

export interface ParsedCSV {
  columns: string[];
  /** rows[r][c] — parsed numbers; non-numeric cells become NaN. */
  rows: number[][];
}

export function parseCSVText(text: string): ParsedCSV {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const raw = result.data as string[][];
  if (raw.length === 0) return { columns: [], rows: [] };

  // Header detection: if the first row has any cell that is not a number,
  // treat it as column names.
  const firstRowNumeric = raw[0].every((cell) => cell.trim() !== '' && !Number.isNaN(Number(cell)));
  const columns = firstRowNumeric ? raw[0].map((_, i) => `col${i + 1}`) : raw[0].map((c) => c.trim());
  const dataRows = firstRowNumeric ? raw : raw.slice(1);

  const rows = dataRows.map((r) => r.map((cell) => (cell.trim() === '' ? NaN : Number(cell))));
  return { columns, rows };
}

/** Columns mode: the first `dims` columns starting at `startColumn` become
 * the HCS dimensions, in order. */
export function datasetFromColumns(csv: ParsedCSV, startColumn: number, dims: number, maxPoints: number): Dataset {
  const end = Math.min(startColumn + dims, csv.columns.length);
  const rows = csv.rows.slice(0, maxPoints).map((r) => r.slice(startColumn, end));
  return { rows, columnNames: csv.columns.slice(startColumn, end) };
}

/** Embed mode: lag-embed a single column into `dims` dimensions. */
export function datasetFromEmbedding(
  csv: ParsedCSV,
  columnIndex: number,
  dims: number,
  lag: number,
  maxPoints: number,
): Dataset {
  const series = csv.rows.map((r) => r[columnIndex]).slice(0, maxPoints + (dims - 1) * lag);
  const ds = lagEmbed(series, dims, lag);
  const name = csv.columns[columnIndex] ?? `col${columnIndex + 1}`;
  ds.columnNames = ds.columnNames.map((c) => c.replace('x', name));
  return ds;
}
