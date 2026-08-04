import { ParsedTable } from './table';

/**
 * Minimal CSV parser: handles quoted fields with embedded commas/quotes. No
 * external dependency needed for the small files this wizard targets.
 *
 * Ported server-side from src/lib/csv.ts (frontend) — the two must be kept
 * in sync if the escaping rules ever change, since the frontend still uses
 * its own copy for the CSV export feature (src/lib/export.ts), independent
 * of this import path.
 */
export function parseCsv(text: string): ParsedTable {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };

  function parseLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells.map((c) => c.trim());
  }

  const columns = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { columns, rows };
}
