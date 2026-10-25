import { describe, expect, it } from 'vitest';
import { largestIcoImage } from './ico';

/** An .ico container around the given entries (each { width, data }). */
function ico(entries: Array<{ width: number; data: Uint8Array }>): Uint8Array {
  const headerSize = 6 + entries.length * 16;
  const total = headerSize + entries.reduce((n, e) => n + e.data.byteLength, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  let offset = headerSize;
  entries.forEach((entry, i) => {
    const at = 6 + i * 16;
    out[at] = entry.width >= 256 ? 0 : entry.width;
    out[at + 1] = entry.width >= 256 ? 0 : entry.width;
    view.setUint32(at + 8, entry.data.byteLength, true);
    view.setUint32(at + 12, offset, true);
    out.set(entry.data, offset);
    offset += entry.data.byteLength;
  });
  return out;
}

/** A 32-bit bitmap entry, bottom-up BGRA, every pixel the given colour. */
function bitmap(width: number, [r, g, b, a]: number[]): Uint8Array {
  const data = new Uint8Array(40 + width * width * 4);
  const view = new DataView(data.buffer);
  view.setUint32(0, 40, true);
  view.setInt32(4, width, true);
  view.setInt32(8, width * 2, true);
  view.setUint16(12, 1, true);
  view.setUint16(14, 32, true);
  for (let i = 40; i < data.length; i += 4) data.set([b, g, r, a], i);
  return data;
}

const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('largestIcoImage', () => {
  it('takes the largest entry, keeping a PNG entry as it is', () => {
    const image = largestIcoImage(ico([{ width: 16, data: bitmap(16, [255, 0, 0, 255]) }, { width: 256, data: fakePng }]));
    expect(image).toMatchObject({ kind: 'png', width: 256 });
    expect(image?.kind === 'png' && Array.from(image.bytes)).toEqual(Array.from(fakePng));
  });

  it('turns a 32-bit bitmap into RGBA pixels', () => {
    const image = largestIcoImage(ico([{ width: 32, data: bitmap(32, [10, 20, 30, 200]) }]));
    expect(image).toMatchObject({ kind: 'rgba', width: 32, height: 32 });
    expect(image?.kind === 'rgba' && Array.from(image.pixels.slice(0, 4))).toEqual([10, 20, 30, 200]);
  });

  it('shows a bitmap with empty alpha as opaque rather than blank', () => {
    const image = largestIcoImage(ico([{ width: 16, data: bitmap(16, [10, 20, 30, 0]) }]));
    expect(image?.kind === 'rgba' && image.pixels[3]).toBe(255);
  });

  it('returns null for anything that is not an icon file', () => {
    expect(largestIcoImage(fakePng)).toBeNull();
    expect(largestIcoImage(new Uint8Array([0, 0, 1, 0, 1, 0]))).toBeNull();
  });
});
