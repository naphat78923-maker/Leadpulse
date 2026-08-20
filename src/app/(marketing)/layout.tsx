import { Lustria, DM_Sans, Martian_Mono } from 'next/font/google';
import './zams.css';

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

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${lustria.variable} ${dmSans.variable} ${martianMono.variable} zams-sans bg-white min-h-screen text-zams-slate antialiased`}
    >
      {children}
    </div>
  );
}
