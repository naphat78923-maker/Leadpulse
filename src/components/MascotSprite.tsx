import Image from 'next/image';

/**
 * Small framed claymation sprite. Uses mix-blend-multiply in light mode so the
 * baked off-white studio background melts into light surfaces instead of
 * showing a hard square; dark mode keeps it normal with reduced opacity.
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
      className={`inline-flex shrink-0 overflow-hidden rounded-md border border-clay-hairline/60 bg-white/60 dark:bg-clay-card/50 dark:border-clay-hairline ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        width={1024}
        height={1024}
        className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal dark:opacity-75"
      />
    </span>
  );
}
