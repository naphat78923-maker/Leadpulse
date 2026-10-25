'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { analyzeLogo, logoPlacement, type LogoFit } from '@/utils/logo-fit';

// How each logo sits in its tile is worked out once per logo URL and remembered: in memory for
// this visit, and in this browser's storage so a reload doesn't redo it. A logo whose pixels
// can't be read (a site that refuses cross-origin reads) keeps the plain contained look.

type Known = LogoFit | { kind: 'plain' };

const CACHE_PREFIX = 'leadpulse.logofit.v1:';
const ANALYSIS_PX = 96;
const memory = new Map<string, Known>();
const pending = new Map<string, Promise<Known>>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function remembered(src: string): Known | undefined {
  const hit = memory.get(src);
  if (hit) return hit;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + src);
    if (!raw) return undefined;
    const fit = JSON.parse(raw) as LogoFit;
    memory.set(src, fit);
    return fit;
  } catch {
    return undefined;
  }
}

function measure(src: string): Promise<Known> {
  const running = pending.get(src);
  if (running) return running;
  const job = new Promise<Known>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const scale = Math.min(1, ANALYSIS_PX / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve({ kind: 'plain' });
        ctx.drawImage(img, 0, 0, width, height);
        const fit = analyzeLogo(ctx.getImageData(0, 0, width, height).data, width, height);
        try { window.localStorage.setItem(CACHE_PREFIX + src, JSON.stringify(fit)); } catch { /* storage full or blocked */ }
        resolve(fit);
      } catch {
        resolve({ kind: 'plain' });
      }
    };
    img.onerror = () => resolve({ kind: 'plain' });
    img.src = src;
  }).then((known) => {
    memory.set(src, known);
    pending.delete(src);
    listeners.forEach((listener) => listener());
    return known;
  });
  pending.set(src, job);
  return job;
}

/** A company logo filling its tile: the mark scaled to the tile on its own background, or a
 *  photo cropped to fill it. Sized by its parent (position: relative, overflow hidden). */
export default function LogoImage({ src, alt, onError }: { src: string; alt: string; onError: () => void }) {
  const fit = useSyncExternalStore(subscribe, () => remembered(src), () => undefined);
  useEffect(() => {
    if (!remembered(src)) void measure(src);
  }, [src]);

  /* eslint-disable @next/next/no-img-element -- remote CRM logos, positioned inside the tile */
  let body: React.ReactNode;
  if (fit?.kind === 'cover') {
    body = <img src={src} alt={alt} onError={onError} draggable={false} className="absolute inset-0 h-full w-full object-cover" />;
  } else if (fit?.kind === 'mark') {
    const place = logoPlacement(fit);
    body = (
      <span className="absolute inset-0" style={{ backgroundColor: fit.background ?? '#fff' }}>
        <span className="absolute overflow-hidden" style={{ inset: `${place.inset}%` }}>
          <img
            src={src}
            alt={alt}
            onError={onError}
            draggable={false}
            className="absolute max-w-none"
            style={{ width: `${place.width}%`, height: `${place.height}%`, left: `${place.left}%`, top: `${place.top}%` }}
          />
        </span>
      </span>
    );
  } else {
    body = (
      <span className="absolute inset-0 bg-white">
        <img src={src} alt={alt} onError={onError} draggable={false} className="h-full w-full object-contain p-[8%]" />
      </span>
    );
  }
  /* eslint-enable @next/next/no-img-element */

  return (
    <>
      {body}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(43,33,26,0.10)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" />
    </>
  );
}
