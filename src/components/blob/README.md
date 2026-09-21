# blob/ — the LeadPulse butter-pat mascot

A living SVG mascot: one morphing butter pat, two hole eyes, six states mapped to
deal reality (`idle`, `thinking`, `nudge`, `alert`, `sleep`, `joy`).

## Credit

Engine techniques adapted from **bloub** by jeremy-prt —
<https://github.com/jeremy-prt/bloub> — MIT license. What we took:

- the clock-free, framework-free pure `engine.sample(t)`
- radial-profile morphing (all silhouettes sampled at the same 64 angles, so
  transitions are linear radius interpolation — no path-morph library)
- eyes painted on a sphere (tangent-frame projection gives depth for free)
- eyes as holes in a `<mask>` (self-clipping, page shows through)
- blink as a vertical screen-space squash applied after the tangent matrix
- gaze model: absolute `Look` mixed by the engine, drift layered after the mix
- exponential ease-out transitions (measured on their reference video)

The character itself (butter pat body, state catalog, poses) is an original
LeadPulse design — bloub's MIT license covers their code; the design they
imitate belongs to x.ai, and we do not reproduce it.

## Rules (same as upstream)

- `sample(t)` stays a **pure function of time** — no `Date.now()`, no React
  import, no hidden state. That is what makes `frozenAt` and the tests possible.
- New states declare `pose(local)` only; ambient life (drift, blink, breath)
  belongs to the engine, not the state.
- Per-eye `tilt` only reads on elongated eyes: if w/h ratio is inside
  [0.6, 1.7], don't bother tilting (upstream measured this the hard way).
