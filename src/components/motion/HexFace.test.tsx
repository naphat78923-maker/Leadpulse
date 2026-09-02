import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import HexFace, { HEX_KIND_ACCENT } from './HexFace';
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

describe('HexFace', () => {
  it('maps every clay kind to a solid accent token', () => {
    const kinds: ClayKind[] = [
      'call',
      'message',
      'package',
      'search',
      'pause',
      'success',
    ];
    for (const k of kinds) {
      expect(HEX_KIND_ACCENT[k]).toMatch(/--color-clay-/);
    }
  });

  it('renders as an img role with kind data attrs', () => {
    stubMatchMedia(false);
    render(<HexFace kind="call" size={48} alt="Greeting hex" />);
    const el = screen.getByRole('img', { name: 'Greeting hex' });
    expect(el.getAttribute('data-hex-face')).not.toBeNull();
    expect(el.getAttribute('data-kind')).toBe('call');
    expect((el as HTMLElement).style.width).toBe('48px');
    expect((el as HTMLElement).style.height).toBe('48px');
  });

  it('press pointer down/up keeps the face mounted (freeze path)', () => {
    stubMatchMedia(false);
    render(<HexFace kind="success" size={56} alt="Press me" />);
    const el = screen.getByRole('img', { name: 'Press me' });
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
