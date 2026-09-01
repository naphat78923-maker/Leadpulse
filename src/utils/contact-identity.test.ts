import { describe, expect, it } from 'vitest';

import { CONTACT_IDENTITY_OPTIONS, contactNameFieldCopy } from './contact-identity';

describe('contact identity presentation', () => {
  it('keeps every supported contact-quality option in one source of truth', () => {
    expect(CONTACT_IDENTITY_OPTIONS.map(option => option.value)).toEqual([
      'unknown',
      'named',
      'role_only',
      'company_route',
    ]);
  });

  it('uses a role label instead of asking for a full name when the name is unknown', () => {
    expect(contactNameFieldCopy('role_only')).toEqual({
      label: 'Role or contact label *',
      placeholder: 'e.g., Head Chef, name unknown',
    });
  });

  it('uses a route label for company-only contact routes', () => {
    expect(contactNameFieldCopy('company_route')).toEqual({
      label: 'Company route label *',
      placeholder: 'e.g., Buarys general LINE',
    });
  });
});
