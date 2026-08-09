import { formatClashCode } from './clash-code';

describe('formatClashCode', () => {
  it('joins project code, discipline code, and a 4-digit zero-padded sequence', () => {
    expect(formatClashCode('MCA', 'ARS', 1)).toBe('MCA-ARS-0001');
    expect(formatClashCode('MCA', 'ARS', 42)).toBe('MCA-ARS-0042');
  });

  it('does not truncate a sequence wider than 4 digits', () => {
    expect(formatClashCode('MCA', 'ARS', 12345)).toBe('MCA-ARS-12345');
  });

  it('never parses its own output back apart — round-trips through formatting only', () => {
    // Discipline codes have no charset validation (see master-data.dto.ts)
    // and can legally contain a hyphen — formatClashCode must still produce
    // a code that only formatClashCode itself is responsible for reading.
    expect(formatClashCode('MCA', 'HVAC-DUCT', 1)).toBe('MCA-HVAC-DUCT-0001');
  });
});
