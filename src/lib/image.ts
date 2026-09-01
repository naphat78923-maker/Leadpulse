// Resize an uploaded image to a centered square cover and re-encode as
// WebP (JPEG fallback). Keeps uploads small + uniform for company logos.
// Returns a Blob the caller can upload to Supabase Storage.

export const LOGO_MAX_BYTES = 262144; // 256KB — must match bucket + RLS guard
export const LOGO_DIM = 256;

export async function resizeImageToSquare(file: File, dim = LOGO_DIM): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported on this device');

  // cover-crop to square
  const scale = Math.max(dim / bitmap.width, dim / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const x = (dim - w) / 2;
  const y = (dim - h) / 2;
  ctx.drawImage(bitmap, x, y, w, h);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', 0.85)
  );
  if (!blob) throw new Error('Could not encode image');

  const name = (file.name || 'logo').replace(/\.[^.]+$/, '') + '.webp';
  return new File([blob], name, { type: 'image/webp' });
}

export function validateLogoFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Please choose an image file.';
  if (file.size > LOGO_MAX_BYTES) return 'Image must be under 256KB.';
  return null;
}
