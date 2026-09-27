'use client';

import EntityAvatar from '@/components/EntityAvatar';

interface CompanyLogoProps {
  src?: string | null;
  name: string;
  id?: string | null;
  size?: number;
  className?: string;
}

/** Org-shaped avatar — real logo when present, clay glyph fallback otherwise. */
export default function CompanyLogo({ src, name, id, size = 40, className }: CompanyLogoProps) {
  return (
    <EntityAvatar
      kind="org"
      name={name}
      id={id}
      src={src}
      size={size}
      className={className}
      neutral
      interactive={false}
    />
  );
}
