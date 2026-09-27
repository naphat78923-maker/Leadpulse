import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, within } from '@testing-library/react';
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
  it('shows exactly the three pages', () => {
    nav.pathname = '/deals';
    render(<Sidebar />);

    const links = desktopNav().getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['This week', 'Pipeline', 'Accounts']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/deals', '/companies']);
    expect(desktopNav().queryByRole('button', { name: 'More' })).toBeNull();
  });
});
