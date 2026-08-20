import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeadPulse — B2B sales CRM',
  description: 'Contacts, companies, deals, and meetings in one action-driven pipeline. Built for VG Saveur.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
