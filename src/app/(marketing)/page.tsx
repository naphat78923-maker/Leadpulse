import Link from 'next/link';
import Image from 'next/image';

const navLinks = [
  { href: '/dashboard', label: 'Product' },
  { href: '/deals', label: 'Pipeline' },
  { href: '/contacts', label: 'Contacts' },
];

const stackLogos = ['VG SAVEUR', 'NEXT.JS', 'SUPABASE', 'VERCEL', 'TAILWIND'];

const integrationLogos = ['Notion', 'HubSpot', 'Salesforce', 'Slack', 'Gong', 'Google Sheets', 'Gmail', 'Line'];

const complianceSeals = [
  { initials: 'SOC2', label: 'AICPA SOC 2', color: '#0072c6' },
  { initials: 'GDPR', label: 'GDPR', color: '#1a3a5c' },
  { initials: 'HIPAA', label: 'HIPAA', color: '#2a6e6e' },
  { initials: 'CCPA', label: 'CCPA', color: '#4f4f4f' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ─── Top Navigation ─── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-zams-mist">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-zams-violet flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="zams-sans text-[15px] font-semibold text-zams-ink tracking-tight">LeadPulse</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link key={link.label} href={link.href} className="zams-nav-link">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="zams-nav-link hidden sm:inline-block">
              Log in
            </Link>
            <Link href="/dashboard" className="zams-btn-primary">
              Get early access
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="max-w-[1200px] mx-auto px-6 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <div>
            <p className="zams-eyebrow mb-4">B2B sales CRM · VG Saveur</p>
            <h1 className="zams-display-hero mb-5">
              Butter sales, without the spreadsheet chaos.
            </h1>
            <p className="zams-body mb-8 max-w-[480px]">
              LeadPulse turns your deals into one clear next action. Contacts, companies,
              and meetings stay connected so nothing slips between follow-ups.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/dashboard" className="zams-btn-primary">
                Get early access
              </Link>
              <Link href="/deals" className="zams-btn-outline">
                Explore the pipeline
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 zams-dotted-grid rounded-lg" aria-hidden />
            <Image
              src="/assets/deal-lanes-hero.png"
              alt="Three clay characters pushing deals through the WIN, LOST, and FOLLOW UP lanes"
              width={1344}
              height={768}
              className="relative w-full h-auto rounded border border-zams-mist"
              priority
            />
          </div>
        </div>
      </section>

      {/* ─── Trust Strip ─── */}
      <section className="border-y border-zams-mist bg-white py-8">
        <div className="max-w-[1200px] mx-auto px-6">
          <p className="zams-eyebrow text-center mb-6">Trusted by</p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {stackLogos.map(logo => (
              <span
                key={logo}
                className="zams-mono text-[13px] font-medium tracking-[0.14em] text-zams-fog"
              >
                {logo}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Feature 1: Action Board ─── */}
      <section className="max-w-[1200px] mx-auto px-6 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <div>
            <p className="zams-eyebrow mb-4">Action board</p>
            <h2 className="zams-display-heading mb-5">
              One deal, one next action. No more guessing.
            </h2>
            <p className="zams-body mb-8">
              Every deal lives in an action lane — outreach, follow up, reschedule, or parked —
              so your pipeline shows what to do next, not just where a deal sits.
            </p>
            <Link href="/deals" className="zams-btn-outline">
              See the board
            </Link>
          </div>
          <div className="bg-zams-snow rounded-lg p-8 border border-zams-mist flex items-center justify-center">
            <Image
              src="/assets/mascot-teardrop.png"
              alt="LeadPulse mascot holding a deal card"
              width={1024}
              height={1024}
              className="w-64 h-64 md:w-80 md:h-80 object-contain"
            />
          </div>
        </div>
      </section>

      {/* ─── Feature 2: Connected Contacts & Companies ─── */}
      <section className="border-y border-zams-mist bg-zams-snow">
        <div className="max-w-[1200px] mx-auto px-6 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
            <div className="order-2 md:order-1 zams-dotted-grid rounded-lg p-8 border border-zams-mist bg-white">
              <div className="grid grid-cols-2 gap-3">
                {integrationLogos.slice(0, 4).map(name => (
                  <div key={name} className="border border-zams-mist rounded p-4 bg-white flex items-center justify-center">
                    <span className="zams-sans text-sm font-semibold text-zams-slate">{name}</span>
                  </div>
                ))}
                <div className="col-span-2 border border-zams-mist rounded p-4 bg-white flex items-center justify-center">
                  <span className="zams-mono text-[11px] uppercase tracking-[0.22px] text-zams-fog">
                    + {integrationLogos.length - 4} more
                  </span>
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <p className="zams-eyebrow mb-4">Connected records</p>
              <h2 className="zams-display-heading mb-5">
                Contacts and companies, linked by design.
              </h2>
              <p className="zams-body mb-8">
                A buyer belongs to an account. Meetings, samples, and emails attach to the
                person who moved them — so the story of every relationship stays intact.
              </p>
              <Link href="/contacts" className="zams-btn-outline">
                Browse contacts
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Integrations Bento ─── */}
      <section className="max-w-[1200px] mx-auto px-6 py-16 md:py-24">
        <p className="zams-eyebrow text-center mb-4">Integrations</p>
        <h2 className="zams-display-heading text-center mb-10 max-w-[640px] mx-auto">
          Connect anything you already run.
        </h2>
        <div className="zams-dotted-grid rounded-lg border border-zams-mist p-6 md:p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {integrationLogos.map((name, i) => (
              <div
                key={name}
                className="border border-zams-mist rounded bg-white p-6 flex items-center justify-center"
              >
                <span className="zams-sans text-sm font-semibold text-zams-slate">{name}</span>
              </div>
            ))}
            <div className="col-span-2 md:col-span-2 rounded border border-zams-mist bg-white p-6 flex flex-col items-center justify-center gap-4 text-center">
              <span className="zams-display text-lg font-semibold text-zams-ink">Connect anything</span>
              <Link href="/dashboard" className="zams-btn-outline">
                Explore integrations
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Security & Trust ─── */}
      <section className="border-t border-zams-mist bg-white">
        <div className="max-w-[1200px] mx-auto px-6 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="zams-eyebrow mb-4">Security</p>
            <h2 className="zams-display-heading mb-5">Your sales data stays yours.</h2>
            <p className="zams-body mb-8">
              Row-level access, encrypted storage, and a policy of no training on your data.
              Built on Supabase with audit-friendly defaults.
            </p>
            <Link href="/dashboard" className="zams-btn-outline">
              Visit trust center
            </Link>
          </div>
          <div className="flex items-center justify-center gap-4 md:gap-6 flex-wrap">
            {complianceSeals.map(seal => (
              <div key={seal.initials} className="flex flex-col items-center gap-2">
                <div
                  className="w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center text-white text-[10px] md:text-[11px] font-bold tracking-wide"
                  style={{ backgroundColor: seal.color }}
                >
                  {seal.initials}
                </div>
                <span className="zams-mono text-[9px] uppercase tracking-[0.18px] text-zams-fog">
                  {seal.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Custom Banner ─── */}
      <section className="max-w-[1200px] mx-auto px-6 pb-16 md:pb-24">
        <div className="bg-zams-snow border border-zams-mist rounded-lg p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-white border border-zams-mist flex items-center justify-center shrink-0">
              <Image
                src="/assets/mascot-teardrop.png"
                alt=""
                width={1024}
                height={1024}
                className="w-10 h-10 rounded-full object-cover"
              />
            </div>
            <div>
              <h3 className="zams-sans text-base font-semibold text-zams-ink">
                Built for VG Saveur butter sales
              </h3>
              <p className="zams-sans text-sm text-zams-slate mt-1 max-w-[480px]">
                Lane logic, sample tracking, and follow-up nudges tailored to how a food
                business actually sells.
              </p>
            </div>
          </div>
          <Link href="/dashboard" className="zams-btn-primary shrink-0">
            Request a custom build
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-zams-mist bg-white">
        <div className="max-w-[1200px] mx-auto px-6 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-zams-violet flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="zams-sans text-sm font-semibold text-zams-ink">LeadPulse</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="zams-mono text-[11px] uppercase tracking-[0.22px] text-zams-fog">Engineered, not assembled</span>
            <span className="zams-mono text-[11px] uppercase tracking-[0.22px] text-zams-fog">© 2026 VG Saveur</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
