'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Building2, Kanban, Calendar, Activity, Zap, Menu, X, BarChart3 } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '@/components/ThemeProvider';

const navItems = [
  { href: '/', label: 'Today', icon: LayoutDashboard },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/deals', label: 'Deals', icon: Kanban },
  { href: '/meetings', label: 'Meetings', icon: Calendar },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* ═══ Mobile Header ═══ */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-clay-canvas/95 backdrop-blur-sm border-b border-clay-hairline">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 -ml-2 text-clay-ink active:bg-clay-surface rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-clay-ink flex items-center justify-center">
              <Zap className="w-3 h-3 text-clay-canvas" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-bold text-clay-ink">LeadPulse</span>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 -mr-2 text-clay-muted active:bg-clay-surface rounded-lg"
          >
            {theme === 'light' ? <span className="text-lg">🌙</span> : <span className="text-lg">☀️</span>}
          </button>
        </div>
      </header>

      {/* ═══ Mobile Slide-in Menu ═══ */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-clay-canvas flex flex-col animate-slide-in">
            <div className="p-4 border-b border-clay-hairline flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-clay-ink flex items-center justify-center">
                  <Zap className="w-4 h-4 text-clay-canvas" strokeWidth={2.5} />
                </div>
                <div>
                  <h1 className="text-sm font-bold text-clay-ink">LeadPulse</h1>
                  <p className="text-[10px] text-clay-muted">VG Saveur</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 text-clay-muted active:bg-clay-surface rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-2 overflow-y-auto">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-1',
                      isActive ? 'bg-clay-card text-zams-violet' : 'text-clay-muted active:bg-clay-surface'
                    )}
                  >
                    <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-clay-hairline">
              <button
                onClick={() => { toggleTheme(); setIsOpen(false); }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-clay-muted active:bg-clay-surface"
              >
                <span className="text-lg">{theme === 'light' ? '🌙' : '☀️'}</span>
                {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ═══ Desktop Sidebar ═══ */}
      <aside className="hidden lg:flex lg:w-60 bg-clay-canvas border-r border-clay-hairline flex-col">
        <div className="p-4 border-b border-clay-hairline">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-clay-ink flex items-center justify-center">
              <Zap className="w-4 h-4 text-clay-canvas" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-clay-ink">LeadPulse</h1>
              <p className="text-[10px] text-clay-muted">VG Saveur CRM</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1',
                  isActive ? 'bg-clay-card text-zams-violet' : 'text-clay-muted hover:bg-clay-surface'
                )}
              >
                <Icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-clay-hairline">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-clay-muted hover:bg-clay-surface"
          >
            <span>{theme === 'light' ? '🌙' : '☀️'}</span>
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
        </div>
      </aside>
    </>
  );
}
