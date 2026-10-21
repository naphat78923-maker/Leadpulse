// ─── This week's clay scenes, drawn with three.js ───
// Matte clay to match the mascots in public/assets/clay: soft studio light, rough
// material, a shadow-only floor so the card shows through. Layout numbers come from
// utils/clay-layout.ts; this file only turns them into meshes and motion.

import type * as Three from 'three';
import { pebblePile, pillarHeights, ribbonPoints, ringArcs } from '@/utils/clay-layout';

export type ClaySpec =
  /** overdue items by age: over two weeks, last week, this week */
  | { kind: 'overdue'; groups: [number, number, number] }
  /** items due over seven days, today first */
  | { kind: 'week'; counts: number[] }
  /** check-ins: at risk, dormant, watch, reorder due, healthy */
  | { kind: 'checkins'; counts: [number, number, number, number, number] }
  /** touches per day over the last seven days, and the total the week before */
  | { kind: 'touches'; series: number[]; previous: number };

export interface BuiltScene {
  scene: Three.Scene;
  camera: Three.PerspectiveCamera;
  /** tilted toward the pointer */
  root: Three.Group;
  /** fit the camera to the card's shape: narrow cards pull back so nothing is cut off */
  frame: (aspect: number) => void;
  /** pose at `t` seconds since the scene (re)started; settles after about 1.5s */
  tick: (t: number) => void;
  dispose: () => void;
}

// The app's clay palette (globals.css).
const C = {
  error: 0xb5342a, errorMid: 0xd4675c, errorSoft: 0xeba69c,
  coral: 0xe0766a, lavender: 0xb8a4ed, lavenderDeep: 0x9f87e3,
  ochre: 0xd6a42a, mint: 0x7fc9a8, teal: 0x3f8c83, grey: 0xa9a49a,
};

const easeOut = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

function stage(T: typeof Three, dark: boolean) {
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 2, 0.1, 100);
  scene.add(new T.HemisphereLight(0xfff8ee, dark ? 0x3a332b : 0xd9cbb5, dark ? 1.1 : 0.9));
  const sun = new T.DirectionalLight(0xffffff, dark ? 1.1 : 1.6);
  sun.position.set(-3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.radius = 4;
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
  scene.add(sun);
  const floor = new T.Mesh(new T.PlaneGeometry(30, 30), new T.ShadowMaterial({ opacity: dark ? 0.32 : 0.13 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const root = new T.Group();
  scene.add(root);
  const clay = (color: number) => new T.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 });
  const add = <M extends Three.Mesh>(mesh: M) => { mesh.castShadow = true; root.add(mesh); return mesh; };
  const dispose = () => scene.traverse((o) => {
    const mesh = o as Three.Mesh;
    mesh.geometry?.dispose();
    const m = mesh.material;
    (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => x.dispose());
  });
  return { scene, camera, root, clay, add, dispose };
}

export function buildScene(T: typeof Three, spec: ClaySpec, dark: boolean): BuiltScene {
  const s = stage(T, dark);
  const { camera, clay, add } = s;
  let tick: (t: number) => void = () => {};
  /** how far the scene reaches left and right of centre, for framing */
  let halfWidth = 2.5;
  const look = new T.Vector3();

  if (spec.kind === 'overdue') {
    camera.position.set(0, 2.9, 6.6);
    look.set(0, 0.7, 0);
    halfWidth = 2.6;
    const shades = [C.error, C.errorMid, C.errorSoft].map(clay);
    const geo = new T.SphereGeometry(0.42, 32, 20);
    const pebbles = pebblePile(spec.groups).map((p, i) => {
      const mesh = add(new T.Mesh(geo, shades[p.group]));
      mesh.scale.set(1, 0.62, 1);
      mesh.rotation.y = i * 1.3;
      return { mesh, p, delay: i * 0.06 };
    });
    tick = (t) => pebbles.forEach(({ mesh, p, delay }, i) => {
      const k = Math.min(1, Math.max(0, (t - delay) / 0.7));
      const fall = k < 1 ? easeOut(k) + Math.sin(k * Math.PI) * 0.18 : 1;
      mesh.position.set(p.x, p.y + (1 - fall) * 5 + (k >= 1 ? Math.sin(t * 1.6 + i) * 0.02 : 0), p.z);
    });
  }

  if (spec.kind === 'week') {
    camera.position.set(0, 2.8, 7.2);
    look.set(0, 0.8, 0);
    halfWidth = 3.4;
    const empty = clay(dark ? 0x4a4238 : 0xe4dccb);
    const pillars = pillarHeights(spec.counts).map((h, i) => {
      const r = 0.34;
      const profile = [new T.Vector2(0, 0), new T.Vector2(r, 0)];
      for (let j = 0; j <= 8; j++) {
        const a = (j / 8) * (Math.PI / 2);
        profile.push(new T.Vector2(r * Math.cos(a), Math.max(0, h - r) + r * Math.sin(a)));
      }
      const busy = spec.counts[i] > 0;
      const mesh = add(new T.Mesh(new T.LatheGeometry(profile, 32), busy ? clay(i <= 1 ? C.lavenderDeep : C.lavender) : empty));
      mesh.position.set((i - 3) * 0.95, 0, 0);
      return { mesh, delay: i * 0.08, busy };
    });
    const todayRing = add(new T.Mesh(new T.TorusGeometry(0.44, 0.06, 12, 40), clay(C.coral)));
    todayRing.rotation.x = -Math.PI / 2;
    todayRing.position.set(-3 * 0.95, 0.03, 0);
    tick = (t) => pillars.forEach(({ mesh, delay, busy }, i) => {
      const k = (t - delay) / 0.6;
      mesh.scale.y = 0.01 + 0.99 * easeOut(k) + (k >= 1 && busy && i <= 1 ? Math.sin(t * 2.4) * 0.03 : 0);
    });
  }

  if (spec.kind === 'checkins') {
    camera.position.set(0, 3.1, 5.9);
    look.set(0, 0.5, 0);
    halfWidth = 1.6;
    const colors = [C.coral, C.grey, C.ochre, C.lavender, C.mint];
    const ring = new T.Group();
    const arcs = ringArcs(spec.counts);
    (arcs.length ? arcs : [{ start: 0, length: Math.PI * 2, index: 4 }]).forEach((arc) => {
      const mesh = new T.Mesh(new T.TorusGeometry(1.15, 0.3, 20, 64, arc.length), clay(colors[arc.index]));
      mesh.rotation.z = arc.start;
      mesh.castShadow = true;
      ring.add(mesh);
    });
    ring.rotation.x = -Math.PI / 2.6;
    ring.position.y = 0.75;
    s.root.add(ring);
    tick = (t) => {
      ring.scale.setScalar(0.2 + 0.8 * easeOut(t / 1.1));
      ring.rotation.z = t * 0.25;
    };
  }

  if (spec.kind === 'touches') {
    camera.position.set(0, 3.2, 6.4);
    look.set(0, 0.5, 0);
    halfWidth = 3.0;
    const { points, baseline } = ribbonPoints(spec.series, spec.previous);
    const curve = new T.CatmullRomCurve3(points.map(([x, y, z]) => new T.Vector3(x, y, z)));
    const tube = add(new T.Mesh(new T.TubeGeometry(curve, 160, 0.09, 10, false), clay(C.teal)));
    const drawn = tube.geometry.index?.count ?? 0;
    const ball = add(new T.Mesh(new T.SphereGeometry(0.2, 24, 16), clay(C.mint)));
    // Last week's daily average: a faint flat bar on the same scale.
    const ghost = add(new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 5.4, 8), clay(dark ? 0x5a5148 : 0xd8cfbd)));
    ghost.rotation.z = Math.PI / 2;
    ghost.position.set(0, baseline, -0.45);
    ghost.castShadow = false;
    tick = (t) => {
      const k = Math.min(1, t / 1.4);
      tube.geometry.setDrawRange(0, Math.floor(drawn * k));
      // Draws in, then rolls gently back and forth over the most recent days.
      const u = k < 1 ? k : 0.55 + 0.44 * ((Math.sin((t - 1.4) * 0.6 + Math.PI / 2) + 1) / 2);
      const p = curve.getPointAt(Math.min(0.999, u));
      ball.position.set(p.x, p.y + 0.18, p.z);
    };
  }

  const base = camera.position.clone();
  const baseDistance = base.distanceTo(look);
  const direction = base.clone().sub(look).normalize();
  const frame = (aspect: number) => {
    camera.aspect = aspect;
    const halfFov = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * aspect);
    const distance = Math.max(baseDistance, (halfWidth + 0.3) / Math.tan(halfFov));
    camera.position.copy(look).addScaledVector(direction, distance);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  };
  frame(2);

  return { scene: s.scene, camera, root: s.root, frame, tick, dispose: s.dispose };
}
