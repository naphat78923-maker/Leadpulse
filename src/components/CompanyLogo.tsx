'use client';

import EntityAvatar from '@/components/EntityAvatar';

interface CompanyLogoProps {
  src?: string | null;
  name: string;
  id?: string | null;
  size?: number;
  className?: string;
}

/** Org-shaped avatar: the real logo when present, otherwise initials in a colour picked from the
 *  account, so accounts without a logo still look different from each other at a glance. */
export default function CompanyLogo({ src, name, id, size = 40, className }: CompanyLogoProps) {
  return (
    <EntityAvatar
      kind="org"
      name={name}
      id={id}
      src={src}
      size={size}
      className={className}
      interactive={false}
    />
  );
}
