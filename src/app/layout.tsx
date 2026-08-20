import type { Metadata } from 'next';
import { Inter, Lustria, DM_Sans, Martian_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { ThemeProvider } from '@/components/ThemeProvider';
import { CrmProvider } from '@/components/CrmProvider';
import { ToastProvider } from '@/components/ToastProvider';

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
        </ThemeProvider>
      </body>
    </html>
  );
}
