import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LogoImage from './LogoImage';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const remember = (src: string, fit: unknown) => window.localStorage.setItem(`leadpulse.logofit.v1:${src}`, JSON.stringify(fit));

describe('LogoImage', () => {
  it('scales a remembered mark to the tile on its own background', () => {
    remember('https://logos.test/a.webp', { kind: 'mark', background: 'rgb(1 98 65)', box: { x: 0.2, y: 0.4, w: 0.6, h: 0.2 }, aspect: 1 });
    const { container } = render(<LogoImage src="https://logos.test/a.webp" alt="Lemon farm logo" onError={() => {}} />);
    const img = screen.getByAltText('Lemon farm logo') as HTMLImageElement;
    expect(img.style.width).toBe('166.7%');
    expect(img.style.left).toBe('-33.3%');
    expect((img.parentElement as HTMLElement).style.inset).toBe('7%');
    expect((container.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(1 98 65)');
  });

  it('crops a remembered photo to fill the tile', () => {
    remember('https://logos.test/b.webp', { kind: 'cover' });
    render(<LogoImage src="https://logos.test/b.webp" alt="ADOR logo" onError={() => {}} />);
    expect(screen.getByAltText('ADOR logo').className).toContain('object-cover');
  });

  it('shows the logo contained until it has been measured', () => {
    render(<LogoImage src="https://logos.test/new.webp" alt="New logo" onError={() => {}} />);
    expect(screen.getByAltText('New logo').className).toContain('object-contain');
  });
});
