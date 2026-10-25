// ─── Reading a favicon.ico ───
// Pure. An .ico file holds several sizes of the same icon, each either a PNG or a bitmap.
// The image library used for logos reads neither container, so the largest picture is taken
// out here: PNG bytes as they are, or a 32-bit bitmap turned into plain RGBA pixels.

export type IcoImage =
  | { kind: 'png'; bytes: Uint8Array; width: number }
  | { kind: 'rgba'; pixels: Uint8Array; width: number; height: number };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

function bitmapPixels(data: Uint8Array): { pixels: Uint8Array; width: number; height: number } | null {
  if (data.byteLength < 40) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerSize = view.getUint32(0, true);
  const width = view.getInt32(4, true);
  const height = Math.abs(view.getInt32(8, true)) / 2; // the height counts the mask too
  const bitCount = view.getUint16(14, true);
  const compression = view.getUint32(16, true);
  // Only 32-bit pixels carry their own transparency; older palette icons are left out.
  if (bitCount !== 32 || (compression !== 0 && compression !== 3) || width <= 0 || height <= 0 || width > 512 || height > 512) return null;
  const start = headerSize + (compression === 3 && headerSize === 40 ? 12 : 0);
  if (start + width * height * 4 > data.byteLength) return null;
  const pixels = new Uint8Array(width * height * 4);
  let anyAlpha = false;
  for (let y = 0; y < height; y++) {
    const from = start + (height - 1 - y) * width * 4; // rows are stored bottom-up
    for (let x = 0; x < width; x++) {
      const i = from + x * 4;
      const o = (y * width + x) * 4;
      pixels[o] = data[i + 2];
      pixels[o + 1] = data[i + 1];
      pixels[o + 2] = data[i];
      pixels[o + 3] = data[i + 3];
      if (data[i + 3]) anyAlpha = true;
    }
  }
  // Some 32-bit icons leave alpha empty and rely on the mask; show them opaque instead of blank.
  if (!anyAlpha) for (let o = 3; o < pixels.length; o += 4) pixels[o] = 255;
  return { pixels, width, height };
}

/** The largest picture in an .ico file, or null when it isn't one or holds nothing readable. */
export function largestIcoImage(bytes: Uint8Array): IcoImage | null {
  if (bytes.byteLength < 6) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) return null;
  const count = view.getUint16(4, true);
  let best: IcoImage | null = null;
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    if (entry + 16 > bytes.byteLength) break;
    const size = view.getUint32(entry + 8, true);
    const offset = view.getUint32(entry + 12, true);
    if (offset + size > bytes.byteLength || size === 0) continue;
    const data = bytes.subarray(offset, offset + size);
    let image: IcoImage | null = null;
    if (PNG_SIGNATURE.every((b, k) => data[k] === b)) {
      image = { kind: 'png', bytes: data, width: bytes[entry] || 256 };
    } else {
      const bitmap = bitmapPixels(data);
      if (bitmap) image = { kind: 'rgba', ...bitmap };
    }
    if (image && (!best || image.width > best.width)) best = image;
  }
  return best;
}
