'use client';

import { useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { pressScale, springPress } from '@/lib/motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  accentFromSeed,
  CLAY_ACCENT_STYLE,
  entityInitials,
  maskRadius,
} from '@/utils/entity-avatar';

export type EntityAvatarKind = 'person' | 'org';

export type EntityAvatarProps = {
  name: string;
  /** Stable hash seed when available (falls back to name). */
  id?: string | null;
  kind: EntityAvatarKind;
  /** Real photo/logo URL — glyph is fallback when missing or load fails. */
  src?: string | null;
  /** List ~28–32; detail ~40–56. */
  size?: number;
  /** Override computed initials (e.g. "?" for missing contact). */
  initials?: string;
  className?: string;
  /** Soft hover/press; default true. */
  interactive?: boolean;
  /** Reserved company marks: neutral initials tile rather than a random accent. */
  neutral?: boolean;
};

const BREATHE_MIN_PX = 40;

/**
 * Shaped clay avatar — squircle (person) / rounded square (org),
 * hash → clay accent glyph, or masked photo/logo when `src` loads.
 */
export default function EntityAvatar({
  name,
  id,
  kind,
  src,
  size = 40,
  initials: initialsProp,
  className,
  interactive = true,
  neutral = false,
}: EntityAvatarProps) {
  const [failed, setFailed] = useState(false);
  const reduceMotion = usePrefersReducedMotion();
  const showImg = Boolean(src) && !failed;

  const seed = (id && String(id).trim()) || name.trim() || 'entity';
  const accent = accentFromSeed(seed);
  const palette = CLAY_ACCENT_STYLE[accent];
  const mark = (initialsProp?.trim() || entityInitials(name)).slice(0, 2);
  const radius = maskRadius(kind);
  const fontSize = Math.max(10, Math.round(size * (mark.length > 1 ? 0.34 : 0.4)));
  const label = kind === 'org' ? `${name} logo` : name;
  const breathe = interactive && !reduceMotion && size >= BREATHE_MIN_PX && !showImg;

  const shellStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    backgroundColor: showImg || neutral ? 'var(--color-clay-surface)' : palette.bg,
    color: neutral ? 'var(--color-clay-ink)' : palette.fg,
    boxShadow: showImg || neutral
      ? 'inset 0 0 0 1px var(--color-clay-hairline)'
      : `inset 0 0 0 1px color-mix(in srgb, ${palette.ring} 35%, transparent)`,
  };

  const markEl = (
    <span
      aria-hidden="true"
      className="select-none font-semibold tracking-wide leading-none"
      style={{ fontSize }}
    >
      {mark}
    </span>
  );

  const inner = showImg ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote CRM logos/photos; mask via parent
    <img
      src={src as string}
      alt={label}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={clsx('h-full w-full', kind === 'org' ? 'object-contain p-1' : 'object-cover')}
      style={{ borderRadius: radius }}
      draggable={false}
    />
  ) : breathe ? (
    <motion.span
      className="inline-flex h-full w-full items-center justify-center"
      animate={{ scale: [1, 1.035, 1] }}
      transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
    >
      {markEl}
    </motion.span>
  ) : (
    markEl
  );

  const sharedClass = clsx(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden',
    className
  );

  const a11y = showImg
    ? {}
    : ({ role: 'img' as const, 'aria-label': label });

  if (!interactive || reduceMotion) {
    return (
      <span
        className={sharedClass}
        style={shellStyle}
        data-accent={accent}
        data-kind={kind}
        {...a11y}
      >
        {showImg ? (
          inner
        ) : (
          markEl
        )}
      </span>
    );
  }

  return (
    <motion.span
      className={sharedClass}
      style={shellStyle}
      data-accent={accent}
      data-kind={kind}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: pressScale }}
      transition={springPress}
      {...a11y}
    >
      {inner}
    </motion.span>
  );
}

/** Alias matching design brief. */
export { EntityAvatar as ShapedAvatar };
