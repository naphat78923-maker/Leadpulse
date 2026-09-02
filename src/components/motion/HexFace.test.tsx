import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import HexFace, { HEX_KIND_ACCENT, HEX_KIND_SHAPE } from './HexFace';
import type { ClayKind } from './ClayCharacter';

const matchMediaMock = vi.fn();

afterEach(() => {
  cleanup();
  matchMediaMock.mockReset();
  // @ts-expect-error test cleanup
  delete window.matchMedia;
});

function stubMatchMedia(reduce: boolean) {
  matchMediaMock.mockImplementation((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;
}

const KINDS: ClayKind[] = [
  'call',
  'message',
  'package',
  'search',
  'pause',
  'success',
];

describe('HexFace', () => {
  it('maps every clay kind to a solid accent token', () => {
    for (const k of KINDS) {
      expect(HEX_KIND_ACCENT[k]).toMatch(/--color-clay-/);
    }
  });

  it('maps every clay kind to a distinct soft shape', () => {
    expect(HEX_KIND_SHAPE).toEqual({
      call: 'hex',
      message: 'squircle',
      package: 'rounded-rect',
      search: 'circle',
      pause: 'diamond',
      success: 'pentagon',
    });
    const shapes = Object.values(HEX_KIND_SHAPE);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('renders as an img role with kind + shape data attrs', () => {
    stubMatchMedia(false);
    render(<HexFace kind="call" size={48} alt="Greeting hex" />);
    const el = screen.getByRole('img', { name: 'Greeting hex' });
    expect(el.getAttribute('data-hex-face')).not.toBeNull();
    expect(el.getAttribute('data-kind')).toBe('call');
    expect(el.getAttribute('data-shape')).toBe('hex');
    expect((el as HTMLElement).style.width).toBe('48px');
    expect((el as HTMLElement).style.height).toBe('48px');
  });

  it('renders the mapped silhouette element per kind', () => {
    stubMatchMedia(false);
    const { container, unmount } = render(
      <HexFace kind="search" size={40} alt="Search face" />
    );
    expect(container.querySelector('circle')).toBeTruthy();
    expect(container.querySelector('polygon')).toBeNull();
    unmount();

    const { container: c2 } = render(
      <HexFace kind="pause" size={40} alt="Pause face" />
    );
    const poly = c2.querySelector('polygon');
    expect(poly).toBeTruthy();
    expect(poly?.getAttribute('points')).toContain('50,12');
    expect(c2.querySelector('[data-shape="diamond"]')).toBeTruthy();
  });

  it('press pointer down/up keeps the face mounted (freeze path)', () => {
    stubMatchMedia(false);
    render(<HexFace kind="success" size={56} alt="Press me" />);
    const el = screen.getByRole('img', { name: 'Press me' });
    expect(el.getAttribute('data-shape')).toBe('pentagon');
    fireEvent.pointerDown(el, { button: 0 });
    expect(el).toBeTruthy();
    fireEvent.pointerUp(el);
    expect(screen.getByRole('img', { name: 'Press me' })).toBeTruthy();
  });

  it('respects prefers-reduced-motion without crashing', () => {
    stubMatchMedia(true);
    render(<HexFace kind="pause" size={44} alt="Static hex" />);
    expect(screen.getByRole('img', { name: 'Static hex' }).getAttribute('data-kind')).toBe(
      'pause'
    );
  });
});
