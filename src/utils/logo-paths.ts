// ─── Where company logos live in storage ───
// One public bucket. A logo in use is logos/<companyId>.webp. A logo found on the account's site
// waits at logos/proposed/<companyId>.webp until Pat picks Use logo (moved into place) or Not
// theirs (moved to logos/rejected/, so the site isn't asked again). Inserts are only allowed
// under logos/ (scripts/fix-company-logo-RLS.sql).

export const COMPANY_LOGO_BUCKET = 'company-logos';
export const PROPOSED_LOGO_DIR = 'logos/proposed';
export const REJECTED_LOGO_DIR = 'logos/rejected';

export const logoPath = (companyId: string) => `logos/${companyId}.webp`;
export const proposedLogoPath = (companyId: string) => `${PROPOSED_LOGO_DIR}/${companyId}.webp`;
export const rejectedLogoPath = (companyId: string) => `${REJECTED_LOGO_DIR}/${companyId}.webp`;

/** The company id a file in a logo folder belongs to ("abc.webp" → "abc"), or null. */
export function companyIdOfLogoFile(name: string): string | null {
  const match = /^([0-9a-f-]{36})\.webp$/i.exec(name);
  return match ? match[1].toLowerCase() : null;
}
