import { parseCsv } from './csv.parser';

describe('parseCsv', () => {
  it('splits a simple comma-separated file into columns and rows', () => {
    const result = parseCsv('judul,disiplin,zona\nBentrok pipa,MEP,Lantai 2\nDinding partisi,ARS,Lantai 1');

    expect(result.columns).toEqual(['judul', 'disiplin', 'zona']);
    expect(result.rows).toEqual([
      ['Bentrok pipa', 'MEP', 'Lantai 2'],
      ['Dinding partisi', 'ARS', 'Lantai 1'],
    ]);
  });

  it('handles quoted fields with embedded commas and escaped quotes', () => {
    const result = parseCsv(
      'judul,deskripsi\n"Bentrok, pipa AC","Ditemukan saat koordinasi ""minggu ini"""',
    );

    expect(result.rows).toEqual([['Bentrok, pipa AC', 'Ditemukan saat koordinasi "minggu ini"']]);
  });

  it('returns empty columns/rows for an empty file', () => {
    expect(parseCsv('')).toEqual({ columns: [], rows: [] });
  });

  it('normalizes CRLF and CR line endings', () => {
    const result = parseCsv('a,b\r\n1,2\r3,4');
    expect(result.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});
