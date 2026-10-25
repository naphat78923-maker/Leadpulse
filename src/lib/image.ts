// Fit an uploaded, pasted or dropped image into a square (the whole image, on a transparent
// background, so a wide wordmark isn't cropped) and re-encode as WebP. Keeps logos small and
// uniform. Returns a File the caller can upload to Supabase Storage.

export const LOGO_MAX_BYTES = 262144; // 256KB — must match bucket + RLS guard
export const LOGO_DIM = 256;
/** What may be picked or pasted before it's shrunk; a phone photo or screenshot is fine. */
const LOGO_INPUT_MAX_BYTES = 20 * 1024 * 1024;

export async function resizeImageToSquare(file: File, dim = LOGO_DIM): Promise<File> {
  const bitmap = await createImageBitmap(file);
  // A small icon stays its own size rather than being blown up into a blur.
  const side = Math.min(dim, Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported on this device');

  // contain: the whole image, centred
  const scale = Math.min(side / bitmap.width, side / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (side - w) / 2, (side - h) / 2, w, h);

  for (const quality of [0.85, 0.7, 0.5]) {
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/webp', quality));
    if (!blob) throw new Error('Could not encode image');
    if (blob.size <= LOGO_MAX_BYTES) {
      const name = (file.name || 'logo').replace(/\.[^.]+$/, '') + '.webp';
      return new File([blob], name, { type: 'image/webp' });
    }
  }
  throw new Error('That image is too detailed to store as a logo');
}

export function validateLogoFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Please choose an image file.';
  if (file.size > LOGO_INPUT_MAX_BYTES) return 'Image must be under 20MB.';
  return null;
}
