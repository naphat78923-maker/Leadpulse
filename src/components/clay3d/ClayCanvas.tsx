'use client';

// One small clay scene inside a card. All scenes on the page share a single WebGL
// renderer: each frame it draws a scene, then copies the pixels into that card's own 2D
// canvas, so a phone holds one GL context instead of four. three.js loads only after
// the page has rendered; until then (or on a device without WebGL) the card shows its
// flat chart. Scenes pause off screen and when the tab is hidden, and with reduced
// motion each draws one still frame.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type * as Three from 'three';
import type { BuiltScene, ClaySpec } from './scenes';

interface View {
  canvas: HTMLCanvasElement;
  built: BuiltScene | null;
  start: number;
  visible: boolean;
  tilt: { x: number; y: number; tx: number; ty: number };
  /** reduced motion: draw once, then only when asked */
  still: boolean;
  dirty: boolean;
}

const views = new Set<View>();
let lib: Promise<{ T: typeof Three; build: typeof import('./scenes').buildScene }> | null = null;
let renderer: Three.WebGLRenderer | null = null;
let rendererSize: Three.Vector2 | null = null;
let failed = false;
let raf = 0;

function load() {
  lib ??= Promise.all([import('three'), import('./scenes')]).then(([T, scenes]) => ({ T, build: scenes.buildScene }));
  return lib;
}

function getRenderer(T: typeof Three): Three.WebGLRenderer | null {
  if (renderer || failed) return renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    rendererSize = new T.Vector2();
  } catch {
    failed = true;
  }
  return renderer;
}

function draw(view: View, now: number) {
  const r = renderer;
  const built = view.built;
  if (!r || !built) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(view.canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(view.canvas.clientHeight * dpr));
  if (view.canvas.width !== w || view.canvas.height !== h) { view.canvas.width = w; view.canvas.height = h; }
  const size = r.getSize(rendererSize!);
  if (size.x !== w || size.y !== h) r.setSize(w, h, false);
  if (built.camera.aspect !== w / h) built.frame(w / h);
  // A frame's timestamp can be a hair before a restart set with performance.now().
  built.tick(view.still ? 10 : Math.max(0, (now - view.start) / 1000));
  const { tilt } = view;
  tilt.x += (tilt.tx - tilt.x) * 0.08;
  tilt.y += (tilt.ty - tilt.y) * 0.08;
  built.root.rotation.set(tilt.x, tilt.y, 0);
  r.render(built.scene, built.camera);
  const ctx = view.canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(r.domElement, 0, 0, w, h);
}

function loop(now: number) {
  raf = 0;
  if (document.hidden) return;
  let again = false;
  for (const view of views) {
    if (!view.visible || !view.built) continue;
    try {
      if (view.still) {
        if (view.dirty) { draw(view, now); view.dirty = false; }
        continue;
      }
      draw(view, now);
      again = true;
    } catch (err) {
      // One broken scene must not stop the others; this card keeps its last frame.
      console.error('Clay scene failed:', err);
      view.built?.dispose();
      view.built = null;
    }
  }
  if (again) raf = requestAnimationFrame(loop);
}

function wake() {
  if (!raf && typeof window !== 'undefined') raf = requestAnimationFrame(loop);
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', wake);

const isDark = () => document.documentElement.classList.contains('dark');

export default function ClayCanvas({ spec, fallback, reduceMotion }: { spec: ClaySpec; fallback: ReactNode; reduceMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const [ready, setReady] = useState(false);
  const key = JSON.stringify(spec);

  // Register the view once; it lives as long as the card.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view: View = { canvas, built: null, start: performance.now(), visible: true, tilt: { x: 0, y: 0, tx: 0, ty: 0 }, still: false, dirty: true };
    viewRef.current = view;
    views.add(view);

    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => { view.visible = entry.isIntersecting; view.dirty = true; if (view.visible) wake(); })
      : null;
    io?.observe(canvas);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { view.dirty = true; wake(); }) : null;
    ro?.observe(canvas);

    // Tilt toward the pointer over the whole card; a tap replays the scene.
    const card = canvas.closest('button') ?? canvas;
    const move = (e: PointerEvent) => {
      const b = card.getBoundingClientRect();
      view.tilt.ty = ((e.clientX - b.left) / b.width - 0.5) * 0.5;
      view.tilt.tx = ((e.clientY - b.top) / b.height - 0.5) * 0.25;
      wake();
    };
    const leave = () => { view.tilt.tx = 0; view.tilt.ty = 0; };
    const replay = () => { view.start = performance.now(); view.dirty = true; wake(); };
    card.addEventListener('pointermove', move as EventListener);
    card.addEventListener('pointerleave', leave);
    card.addEventListener('pointerdown', replay);
    return () => {
      io?.disconnect();
      ro?.disconnect();
      card.removeEventListener('pointermove', move as EventListener);
      card.removeEventListener('pointerleave', leave);
      card.removeEventListener('pointerdown', replay);
      view.built?.dispose();
      views.delete(view);
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view) { view.still = reduceMotion; view.dirty = true; wake(); }
  }, [reduceMotion]);

  // (Re)build the scene when the numbers or the theme change.
  useEffect(() => {
    let cancelled = false;
    const rebuild = () => load().then(({ T, build }) => {
      const view = viewRef.current;
      if (cancelled || !view || !getRenderer(T)) return;
      view.built?.dispose();
      view.built = build(T, JSON.parse(key) as ClaySpec, isDark());
      view.start = performance.now();
      view.dirty = true;
      setReady(true);
      wake();
    }).catch(() => { /* stays on the flat chart */ });
    void rebuild();
    let dark = isDark();
    const mo = new MutationObserver(() => { if (isDark() !== dark) { dark = isDark(); void rebuild(); } });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { cancelled = true; mo.disconnect(); };
  }, [key]);

  return (
    <span className="relative block h-full w-full">
      {!ready && <span className="absolute inset-x-0 bottom-0 block h-[18px]">{fallback}</span>}
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
    </span>
  );
}
