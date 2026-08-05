import { parseXml } from './xml.parser';

const NAVISWORKS_XML = `<?xml version="1.0"?>
<exchange>
  <batchtest>
    <clashtests>
      <clashtest>
        <clashresults>
          <clashresult name="Clash1" status="New" description="Pipa AC vs balok" location="Lantai 2 Zona A"/>
          <clashresult name="Clash2" status="Active" description="Duct vs dinding" location="Lantai 1 Zona B"/>
        </clashresults>
      </clashtest>
    </clashtests>
  </batchtest>
</exchange>`;

const NAVISWORKS_SINGLE_RESULT_XML = `<exchange>
  <batchtest>
    <clashtests>
      <clashtest>
        <clashresults>
          <clashresult name="Clash1" status="New" description="Satu-satunya clash"/>
        </clashresults>
      </clashtest>
    </clashtests>
  </batchtest>
</exchange>`;

const SOLIBRI_XML = `<issues>
  <issue title="Bentrok pipa AC dengan balok" description="Ditemukan saat koordinasi" discipline="MEP" zone="Lantai 2 Zona A"/>
  <issue title="Dinding partisi menutup shaft" description="Perlu revisi shop drawing" discipline="ARS" zone="Lantai 1 Zona B"/>
</issues>`;

describe('parseXml', () => {
  it('flattens Navisworks <clashresult> elements into rows keyed by attribute name', () => {
    const result = parseXml(NAVISWORKS_XML);

    expect(result.columns).toEqual(['name', 'status', 'description', 'location']);
    expect(result.rows).toEqual([
      ['Clash1', 'New', 'Pipa AC vs balok', 'Lantai 2 Zona A'],
      ['Clash2', 'Active', 'Duct vs dinding', 'Lantai 1 Zona B'],
    ]);
  });

  it('handles a Navisworks file with a single clashresult (not an array in the parsed XML)', () => {
    const result = parseXml(NAVISWORKS_SINGLE_RESULT_XML);

    expect(result.rows).toEqual([['Clash1', 'New', 'Satu-satunya clash']]);
  });

  it('flattens Solibri <issue> elements into rows keyed by attribute name', () => {
    const result = parseXml(SOLIBRI_XML);

    expect(result.columns).toEqual(['title', 'description', 'discipline', 'zone']);
    expect(result.rows).toEqual([
      ['Bentrok pipa AC dengan balok', 'Ditemukan saat koordinasi', 'MEP', 'Lantai 2 Zona A'],
      ['Dinding partisi menutup shaft', 'Perlu revisi shop drawing', 'ARS', 'Lantai 1 Zona B'],
    ]);
  });

  it('returns empty columns/rows for XML that matches neither known shape', () => {
    expect(parseXml('<root><nothing/></root>')).toEqual({ columns: [], rows: [] });
  });
});
