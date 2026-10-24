import { describe, expect, it } from 'vitest';
import { analyzeLogo, logoPlacement, type LogoFit } from './logo-fit';

type RGBA = [number, number, number, number];

function image(width: number, height: number, paint: (x: number, y: number) => RGBA): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  return data;
}

const WHITE: RGBA = [255, 255, 255, 255];
const INK: RGBA = [20, 20, 20, 255];
const inside = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const mark = (fit: LogoFit) => {
  if (fit.kind !== 'mark') throw new Error(`expected a mark, got ${fit.kind}`);
  return fit;
};

describe('analyzeLogo', () => {
  it('finds a wordmark inside a white margin, ignoring a grey line on the edge', () => {
    const data = image(100, 100, (x, y) =>
      x === 0 || x === 99 ? [190, 190, 190, 255] : inside(x, y, 20, 40, 79, 59) ? INK : WHITE);
    const fit = mark(analyzeLogo(data, 100, 100));
    expect(fit.background).toBe('rgb(255 255 255)');
    expect(fit.box).toEqual({ x: 0.2, y: 0.4, w: 0.6, h: 0.2 });
    expect(fit.aspect).toBe(1);
  });

  it('keeps a coloured background and reports a transparent one as none', () => {
    const green = mark(analyzeLogo(image(50, 50, (x, y) => (inside(x, y, 10, 10, 39, 39) ? WHITE : [1, 98, 65, 255])), 50, 50));
    expect(green.background).toBe('rgb(1 98 65)');
    const clear = mark(analyzeLogo(image(50, 50, (x, y) => (inside(x, y, 15, 15, 34, 34) ? INK : [0, 0, 0, 0])), 50, 50));
    expect(clear.background).toBeNull();
  });

  it('fills the tile with a photo, which has no plain background', () => {
    const photo = image(60, 60, (x, y) => [(x * 37 + y * 11) % 256, (x * 7 + y * 53) % 256, (x * y) % 256, 255]);
    expect(analyzeLogo(photo, 60, 60)).toEqual({ kind: 'cover' });
  });

  it('fills the tile with a mark that already reaches every side', () => {
    const badge = image(60, 60, (x, y) => (inside(x, y, 1, 1, 58, 58) && (x + y) % 2 === 0 ? INK : (x < 2 || y < 2 || x > 57 || y > 57) ? WHITE : [200, 40, 40, 255]));
    expect(analyzeLogo(badge, 60, 60)).toEqual({ kind: 'cover' });
  });

  it('treats a blank image as a photo rather than an empty mark', () => {
    expect(analyzeLogo(image(20, 20, () => WHITE), 20, 20)).toEqual({ kind: 'cover' });
  });
});

describe('logoPlacement', () => {
  it('scales a wide wordmark to the tile width with a thin margin', () => {
    const fit = mark(analyzeLogo(image(100, 100, (x, y) => (inside(x, y, 20, 40, 79, 59) ? INK : WHITE)), 100, 100));
    expect(logoPlacement(fit)).toEqual({ inset: 7, width: 166.7, height: 166.7, left: -33.3, top: -33.3 });
  });

  it('gives a square mark more air and centres it', () => {
    const placed = logoPlacement({ kind: 'mark', background: null, box: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, aspect: 1 });
    expect(placed).toEqual({ inset: 12, width: 200, height: 200, left: -50, top: -50 });
  });

  it('handles an image that is not square', () => {
    // 200×100 image, mark is the left half: 100×100 px, so it is square and fills the frame.
    const placed = logoPlacement({ kind: 'mark', background: null, box: { x: 0, y: 0, w: 0.5, h: 1 }, aspect: 2 });
    expect(placed).toEqual({ inset: 12, width: 200, height: 100, left: 0, top: 0 });
  });
});
