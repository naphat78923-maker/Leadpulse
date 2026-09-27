import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import type { ComponentProps } from 'react';

const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));

import Sidebar from './Sidebar';

afterEach(() => cleanup());

// The desktop sidebar is always rendered; the mobile drawer only when opened.
const desktopNav = () => within(document.querySelector('aside') as HTMLElement);

describe('Sidebar', () => {
  it('shows the three main pages and keeps the rest collapsed under More', () => {
    nav.pathname = '/';
    render(<Sidebar />);

    const links = desktopNav().getAllByRole('link').map((a) => a.textContent);
    expect(links).toEqual(['This week', 'Pipeline', 'Accounts']);
    const more = desktopNav().getByRole('button', { name: 'More' });
    expect(more.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(more);
    expect(desktopNav().getByRole('link', { name: 'Signals' }).getAttribute('href')).toBe('/signals');
  });

  it('opens More when landing on one of its pages, and can still collapse it', () => {
    nav.pathname = '/retention';
    render(<Sidebar />);

    const more = desktopNav().getByRole('button', { name: 'More' });
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(desktopNav().getByRole('link', { name: 'Retention' })).toBeTruthy();

    fireEvent.click(more);
    expect(desktopNav().queryByRole('link', { name: 'Retention' })).toBeNull();
  });
});
