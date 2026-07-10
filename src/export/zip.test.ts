import { describe, it, expect } from 'vitest';
import { buildZip, crc32 } from './zip';

describe('crc32', () => {
  it('matches the reference value for "123456789"', () => {
    const bytes = new TextEncoder().encode('123456789');
    expect(crc32(bytes)).toBe(0xcbf43926);
  });

  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('buildZip', () => {
  const dv = (u8: Uint8Array): DataView => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  it('produces a structurally valid stored ZIP', () => {
    const zip = buildZip([
      { name: 'a.csv', text: 'id,x\n1,2\n' },
      { name: 'b.csv', text: 'hello' },
    ]);
    const view = dv(zip);
    // Local file header signature at start.
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // End-of-central-directory record at the tail.
    const eocdOff = zip.length - 22;
    expect(view.getUint32(eocdOff, true)).toBe(0x06054b50);
    expect(view.getUint16(eocdOff + 10, true)).toBe(2); // total entries
    // Central directory sits where EOCD says it does.
    const cdOff = view.getUint32(eocdOff + 16, true);
    expect(view.getUint32(cdOff, true)).toBe(0x02014b50);
  });

  it('stores file contents verbatim with correct CRC', () => {
    const text = 'The quick brown fox';
    const zip = buildZip([{ name: 'fox.txt', text }]);
    const view = dv(zip);
    const nameLen = view.getUint16(26, true);
    expect(nameLen).toBe(7);
    const dataStart = 30 + nameLen;
    const data = zip.slice(dataStart, dataStart + text.length);
    expect(new TextDecoder().decode(data)).toBe(text);
    expect(view.getUint32(14, true)).toBe(crc32(new TextEncoder().encode(text)));
    // Stored method (0) and matching sizes.
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(18, true)).toBe(text.length);
    expect(view.getUint32(22, true)).toBe(text.length);
  });
});
