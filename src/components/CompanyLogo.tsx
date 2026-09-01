'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import clsx from 'clsx';

interface CompanyLogoProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}

// Circular brand logo with a graceful Building2 fallback when there is no
// logo or the image fails to load (broken link, 404, deleted bucket object).
export default function CompanyLogo({ src, name, size = 40, className }: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;

  if (showImg) {
    return (
      <img
        src={src as string}
        alt={`${name} logo`}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={clsx('rounded-full object-cover bg-clay-surface border border-clay-hairline', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={clsx('flex items-center justify-center rounded-full bg-clay-surface border border-clay-hairline text-clay-muted', className)}
      style={{ width: size, height: size }}
      aria-label={`${name} logo`}
    >
      <Building2 style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}
