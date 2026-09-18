import type { Metadata, Viewport } from 'next';
import { Inter, Lustria, DM_Sans, Martian_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { ThemeProvider } from '@/components/ThemeProvider';
import { CrmProvider } from '@/components/CrmProvider';
import { ToastProvider } from '@/components/ToastProvider';
import { MotionRoot } from '@/components/motion';

const inter = Inter({ subsets: ['latin'] });

const lustria = Lustria({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-lustria',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const martianMono = Martian_Mono({
  subsets: ['latin'],
  variable: '--font-martian-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LeadPulse CRM — VG Saveur',
  description: 'B2B butter sales CRM. Four connected databases: Contacts, Companies, Deal Pipeline, Meetings.',
  applicationName: 'LeadPulse',
  // Home-screen install: without this, iOS opens the bookmark as a browser tab
  // with browser chrome instead of a standalone app.
  appleWebApp: {
    capable: true,
    title: 'LeadPulse',
    statusBarStyle: 'default',
  },
  other: {
    // Next 16 does not emit this from appleWebApp.capable, and iOS before 16.4
    // only honours the legacy tag — without it those versions open a browser tab.
    'apple-mobile-web-app-capable': 'yes',
  },
};

// Matches --color-clay-canvas so the standalone status bar blends with the app.
export const viewport: Viewport = {
  themeColor: '#fdf6e9',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${lustria.variable} ${dmSans.variable} ${martianMono.variable}`}>
        <ThemeProvider>
          <MotionRoot>
            <CrmProvider>
              <ToastProvider>
                <div className="flex h-screen overflow-hidden bg-clay-canvas text-clay-body">
                  <Sidebar />
                  <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
                    {children}
                  </main>
                </div>
              </ToastProvider>
            </CrmProvider>
          </MotionRoot>
        </ThemeProvider>
      </body>
    </html>
  );
}
