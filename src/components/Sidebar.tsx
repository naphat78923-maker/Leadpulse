'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarCheck, Building2, Kanban, Activity, Zap, Menu, X, HeartPulse, Radar, Target, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '@/components/ThemeProvider';
import { drawerVariants, overlayVariants, tweenBase, tweenFast } from '@/lib/motion';

const navItems = [
  { href: '/', label: 'This week', icon: CalendarCheck },
  { href: '/deals', label: 'Pipeline', icon: Kanban },
  { href: '/companies', label: 'Accounts', icon: Building2 },
];

// Pages being folded into the three above; reachable here until they are.
const moreItems = [
  { href: '/prospects', label: 'Prospects', icon: Target },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/retention', label: 'Retention', icon: HeartPulse },
  { href: '/signals', label: 'Signals', icon: Radar },
];

function NavList({ pathname, compact, onNavigate }: { pathname: string; compact: boolean; onNavigate?: () => void }) {
  // Starts open when landing directly on a More page; toggling always works after that.
  const [moreOpen, setMoreOpen] = useState(() => moreItems.some((item) => item.href === pathname));
  const rowClass = compact ? 'px-4 py-2.5' : 'px-4 py-3';
  const iconClass = compact ? 'w-4 h-4' : 'w-5 h-5';
  const hover = compact ? 'hover:bg-clay-surface' : 'active:bg-clay-surface';

  const renderItem = (item: (typeof navItems)[number], muted = false) => {
    const Icon = item.icon;
    const isActive = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={clsx(
          'nav-link-motion flex items-center gap-3 rounded-lg text-sm font-medium mb-1',
          rowClass,
          isActive ? 'bg-clay-card text-clay-lavender' : clsx(muted ? 'text-clay-muted-soft' : 'text-clay-muted', hover),
        )}
      >
        <Icon className={iconClass} strokeWidth={isActive ? 2.5 : 2} />
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="flex-1 p-2 overflow-y-auto">
      {navItems.map((item) => renderItem(item))}
      <button
        type="button"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((open) => !open)}
        className={clsx('nav-link-motion mt-3 flex w-full items-center gap-2 rounded-lg text-xs font-medium text-clay-muted-soft', rowClass, hover)}
      >
        <ChevronRight className={clsx('w-3.5 h-3.5 transition-transform', moreOpen && 'rotate-90')} />
        More
      </button>
      {moreOpen && moreItems.map((item) => renderItem(item, true))}
    </nav>
  );
}

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
            aria-label="Open menu"
            className="p-2 -ml-2 text-clay-ink active:bg-clay-surface rounded-lg motion-press"
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
            className="p-2 -mr-2 text-clay-muted active:bg-clay-surface rounded-lg motion-press"
          >
            {theme === 'light' ? <span className="text-lg">🌙</span> : <span className="text-lg">☀️</span>}
          </button>
        </div>
      </header>

      {/* ═══ Mobile Slide-in Menu ═══ */}
      <AnimatePresence>
        {isOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <motion.div
              className="absolute inset-0 bg-black/50"
              variants={overlayVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={tweenBase}
              onClick={() => setIsOpen(false)}
            />
            <motion.aside
              className="absolute left-0 top-0 bottom-0 w-72 bg-clay-canvas flex flex-col"
              variants={drawerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={tweenFast}
            >
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
                <button onClick={() => setIsOpen(false)} aria-label="Close menu" className="p-2 text-clay-muted active:bg-clay-surface rounded-lg motion-press">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <NavList pathname={pathname} compact={false} onNavigate={() => setIsOpen(false)} />
              <div className="p-3 border-t border-clay-hairline">
                <button
                  onClick={() => { toggleTheme(); setIsOpen(false); }}
                  className="nav-link-motion flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-clay-muted active:bg-clay-surface"
                >
                  <span className="text-lg">{theme === 'light' ? '🌙' : '☀️'}</span>
                  {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

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
        <NavList pathname={pathname} compact />
        <div className="p-3 border-t border-clay-hairline">
          <button
            onClick={toggleTheme}
            className="nav-link-motion flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-clay-muted hover:bg-clay-surface"
          >
            <span>{theme === 'light' ? '🌙' : '☀️'}</span>
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
        </div>
      </aside>
    </>
  );
}
