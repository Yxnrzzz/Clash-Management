/** Common shape both parsers produce, so ImportService/ImportProcessor never
 * need to know whether a file came in as CSV or XML. */
export interface ParsedTable {
  columns: string[];
  rows: string[][];
}
