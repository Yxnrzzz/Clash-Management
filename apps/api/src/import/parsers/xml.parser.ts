import { XMLParser } from 'fast-xml-parser';
import { ParsedTable } from './table';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Safely stringify an attribute value of unknown shape (fast-xml-parser
 * attributes are normally string/number/boolean, but a malformed/nested
 * element would otherwise silently become the useless "[object Object]"
 * via a bare `String(value)`). */
function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Supports the two clash-detection export shapes named in the Sprint 9
 * brief:
 *  - Navisworks: <exchange><batchtest><clashtests><clashtest><clashresults><clashresult name="..." .../></clashresults></clashtest></clashtests></batchtest></exchange>
 *  - Solibri:    <issues><issue title="..." description="..." .../></issues>
 *
 * Both are attribute-per-field XML, so each <clashresult>/<issue> element's
 * attributes become one row. The result is flattened into the same
 * {columns, rows} shape parseCsv() produces — union of attribute names
 * across all records (first-seen order) as columns, missing attributes on a
 * given record become "".
 */
export function parseXml(text: string): ParsedTable {
  const doc = parser.parse(text) as Record<string, any>;

  const navisworks = doc?.exchange?.batchtest?.clashtests?.clashtest?.clashresults?.clashresult;
  const solibri = doc?.issues?.issue;

  const records: Record<string, unknown>[] = asArray(navisworks ?? solibri);
  if (records.length === 0) return { columns: [], rows: [] };

  const columns: string[] = [];
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }

  const rows = records.map((record) => columns.map((col) => stringifyCell(record[col])));
  return { columns, rows };
}
