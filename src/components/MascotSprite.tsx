import Image from 'next/image';

/**
 * Small framed claymation sprite on a "clay shelf".
 *
 * Light mode: mix-blend-multiply melts the baked off-white studio background
 * into the warm shelf tone so the character sits directly on the surface.
 * Dark mode: the shelf becomes a warm dark chip — the character reads as a
 * framed employee portrait on the night desk, grounded by a soft shadow.
 */
export default function MascotSprite({
  src, size = 24, alt = '', className = '',
}: {
  src: string;
  size?: number;
  alt?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-lg border border-clay-hairline/70 bg-[#f3efe7] dark:bg-[#2b2721] dark:border-clay-hairline/50 shadow-[0_4px_10px_-3px_rgba(0,0,0,0.28)] dark:shadow-[0_5px_12px_-4px_rgba(0,0,0,0.6)] ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        width={1024}
        height={1024}
        className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal dark:brightness-95"
      />
    </span>
  );
}
