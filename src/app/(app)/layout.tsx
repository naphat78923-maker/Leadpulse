import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Sidebar from '@/components/Sidebar';
import { ThemeProvider } from '@/components/ThemeProvider';
import { CrmProvider } from '@/components/CrmProvider';
import { ToastProvider } from '@/components/ToastProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LeadPulse CRM — VG Saveur',
  description: 'B2B butter sales CRM. Four connected databases: Contacts, Companies, Deal Pipeline, Meetings.',
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={inter.className}>
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
    </div>
  );
}
