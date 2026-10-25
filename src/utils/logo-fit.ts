// ─── How a stored logo sits in its tile ───
// Pure. Most stored logos are a 256px square with the mark somewhere inside a plain margin;
// some carry a 1px grey line along an edge. The tile shows only the mark: it finds the plain
// background, the box the mark occupies, and scales that box to the tile. A photo (no plain
// background) fills the tile instead. Nothing is written back to storage.

export type LogoFit =
  | { kind: 'cover' }
  | {
      kind: 'mark';
      /** "rgb(255 255 255)", or null when the background is transparent */
      background: string | null;
      /** the mark's box, as fractions of the image */
      box: { x: number; y: number; w: number; h: number };
      /** the image's own width / height */
      aspect: number;
    };

/** Channel difference still counted as the same colour (WebP noise, anti-aliasing). */
const TOLERANCE = 28;
const TRANSPARENT = 16;
/** Share of the background ring that must match for the background to count as plain. */
const PLAIN_RING = 0.85;

function sameColour(data: ArrayLike<number>, i: number, j: number): boolean {
  const aI = data[i + 3];
  const aJ = data[j + 3];
  if (aI < TRANSPARENT && aJ < TRANSPARENT) return true;
  return (
    Math.abs(data[i] - data[j]) <= TOLERANCE &&
    Math.abs(data[i + 1] - data[j + 1]) <= TOLERANCE &&
    Math.abs(data[i + 2] - data[j + 2]) <= TOLERANCE &&
    Math.abs(aI - aJ) <= TOLERANCE
  );
}

/** Reads RGBA pixels (canvas getImageData order). An edge band about 2% wide is ignored, so a
 *  stray border line neither hides the background nor widens the mark's box. */
export function analyzeLogo(data: ArrayLike<number>, width: number, height: number): LogoFit {
  const edge = Math.max(1, Math.round(Math.min(width, height) * 0.02));
  const left = edge;
  const top = edge;
  const right = width - 1 - edge;
  const bottom = height - 1 - edge;
  if (right - left < 4 || bottom - top < 4) return { kind: 'cover' };
  const at = (x: number, y: number) => (y * width + x) * 4;
  const bg = at(left, top);

  let ring = 0;
  let plain = 0;
  const sample = (x: number, y: number) => { ring++; if (sameColour(data, at(x, y), bg)) plain++; };
  for (let x = left; x <= right; x++) { sample(x, top); sample(x, bottom); }
  for (let y = top + 1; y < bottom; y++) { sample(left, y); sample(right, y); }
  if (plain / ring < PLAIN_RING) return { kind: 'cover' };

  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (sameColour(data, at(x, y), bg)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { kind: 'cover' };
  const innerW = right - left + 1;
  const innerH = bottom - top + 1;
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  // A mark that already reaches every side (an app icon, a full-bleed badge) fills the tile.
  if (boxW >= innerW * 0.96 && boxH >= innerH * 0.96) return { kind: 'cover' };

  return {
    kind: 'mark',
    background: data[bg + 3] < TRANSPARENT ? null : `rgb(${data[bg]} ${data[bg + 1]} ${data[bg + 2]})`,
    box: { x: minX / width, y: minY / height, w: boxW / width, h: boxH / height },
    aspect: width / height,
  };
}

/** Where to draw the image in a square tile so the mark's box fills it, in % of the tile.
 *  A wide wordmark gets a thin margin; a squarer mark a little more air. */
export function logoPlacement(fit: Extract<LogoFit, { kind: 'mark' }>): {
  inset: number; width: number; height: number; left: number; top: number;
} {
  const { box, aspect } = fit;
  // Work in a unit-high image: width = aspect, height = 1.
  const markW = box.w * aspect;
  const markH = box.h;
  const inset = markW / markH >= 1.6 ? 7 : 12;
  const scale = Math.min(1 / markW, 1 / markH);
  const round = (n: number) => Math.round(n * 1000) / 10;
  return {
    inset,
    width: round(aspect * scale),
    height: round(scale),
    left: round(0.5 - (box.x * aspect + markW / 2) * scale),
    top: round(0.5 - (box.y + markH / 2) * scale),
  };
}
