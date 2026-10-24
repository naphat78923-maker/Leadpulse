import { describe, expect, it } from 'vitest';
import type { Company, Contact } from '@/types/crm';
import {
  branchLabel,
  findDuplicatePairs,
  formatPhone,
  historyByCompany,
  historyLabels,
  lineIds,
  mergeSummary,
  nameParts,
  pairKey,
  phoneNumbers,
  reasonLabel,
  suggestedKeep,
  websiteDomain,
} from './company-duplicates';

const company = (id: string, name: string, extra: Partial<Company> = {}): Company => ({
  id,
  name,
  status: 'prospect',
  lead_source: '',
  account_owner: 'Pat',
  last_contact_date: null,
  tags: [],
  industry: null,
  size: null,
  address: null,
  website: null,
  notes: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...extra,
});

const channel = (companyId: string, extra: Partial<Contact>): Pick<Contact, 'company_id' | 'phone' | 'phone_second' | 'line'> => ({
  company_id: companyId,
  phone: null,
  phone_second: null,
  line: null,
  ...extra,
});

const names = (pairs: ReturnType<typeof findDuplicatePairs>) => pairs.map((p) => [p.a.name, p.b.name].sort().join(' + '));

describe('nameParts', () => {
  it('drops legal suffixes, text in parentheses and a leading "the"', () => {
    expect(nameParts('Veganerie Corporation Co., Ltd.').names).toEqual(['veganerie']);
    expect(nameParts('CP Axtra Public Co., Ltd.').names).toEqual(['cp axtra']);
    expect(nameParts('Healthy Lux Co., Ltd. (Head Office)').names).toEqual(['healthy lux']);
    expect(nameParts('Matahari Sdn Bhd (Matahari Organic)').names).toEqual(['matahari']);
    expect(nameParts('The Cookie Jar').names).toEqual(['cookie jar']);
  });

  it('reads " / " as other names the account goes by', () => {
    expect(nameParts('Annam Gourmet / An Nam Group').names).toEqual(['annam gourmet', 'an nam group']);
    expect(nameParts('Buarys / บริษัท ทาสามา จำกัด').names).toEqual(['buarys', 'ทาสามา']);
  });

  it('sets a " - branch" ending apart, but keeps a hyphenated word whole', () => {
    expect(nameParts('Broccoli Revolution - Sukhumvit Rd')).toEqual({ names: ['broccoli revolution'], branch: 'sukhumvit rd' });
    expect(nameParts('Tammang Isaan Vegan – Rama 2')).toEqual({ names: ['tammang isaan vegan'], branch: 'rama 2' });
    expect(nameParts('Kem-Kon Pahurat').names).toEqual(['kemkon pahurat']);
  });
});

describe('websiteDomain', () => {
  it('keeps the registered domain of a website', () => {
    expect(websiteDomain('https://shop.annam-gourmet.com/')).toBe('annam-gourmet.com');
    expect(websiteDomain('https://www.cakeandbakery.co.th/')).toBe('cakeandbakery.co.th');
    expect(websiteDomain('eshop.supernature.com.sg')).toBe('supernature.com.sg');
    expect(websiteDomain('')).toBeNull();
  });

  it('keeps the path of a social page, so two shops on Instagram are not one site', () => {
    expect(websiteDomain('https://instagram.com/vegan_mama')).toBe('instagram.com/vegan_mama');
  });
});

describe('phoneNumbers and lineIds', () => {
  it('reads every number in a field as local digits', () => {
    expect(phoneNumbers('+66 80 135 0032 / +66 2 658 0932')).toEqual(['0801350032', '026580932']);
    expect(phoneNumbers('+66 (0)65 929 1522')).toEqual(['0659291522']);
    expect(phoneNumbers('+66-989188244')).toEqual(['0989188244']);
    expect(phoneNumbers('Hero HQ +62 21 8378 8000')).toEqual(['622183788000']);
    expect(phoneNumbers('7899')).toEqual([]);
  });

  it('reads LINE ids and leaves other apps out', () => {
    expect(lineIds('Line OA @baankerd.bkk')).toEqual(['@baankerd.bkk']);
    expect(lineIds('@MOOYOO')).toEqual(['@mooyoo']);
    expect(lineIds('Line sustaina.bkk')).toEqual(['@sustaina.bkk']);
    expect(lineIds('https://lin.ee/JdI3EvO')).toEqual(['jdi3evo']);
    expect(lineIds('Line @loaves / IG @loaves_glutenfreevegan')).toEqual(['@loaves']);
    expect(lineIds('IG @OHKAJHU')).toEqual([]);
    expect(lineIds('WhatsApp +65 9295 9883')).toEqual([]);
    expect(lineIds('Line@')).toEqual([]);
    expect(lineIds('@/main')).toEqual([]);
  });

  it('formats Thai numbers for reading', () => {
    expect(formatPhone('0989188244')).toBe('098 918 8244');
    expect(formatPhone('025752222')).toBe('02 575 2222');
    expect(formatPhone('622183788000')).toBe('+622183788000');
  });
});

describe('findDuplicatePairs', () => {
  const annam = company('a1', 'Annam Gourmet', { website: 'https://shop.annam-gourmet.com/' });
  const annamGroup = company('a2', 'Annam Gourmet / An Nam Group', { website: 'https://annam-group.com' });
  const veganerie = company('v1', 'Veganerie', { status: 'active_customer' });
  const veganerieCo = company('v2', 'Veganerie Corporation Co., Ltd.', { status: 'active_customer' });
  const broccoli = company('b1', 'Broccoli Revolution', { status: 'active_customer' });
  const broccoliSukhumvit = company('b2', 'Broccoli Revolution - Sukhumvit Rd');
  const kemkon = company('k1', 'Kemkon', { website: 'https://www.kem-kon.com' });
  const kemkonPahurat = company('k2', 'Kem-Kon Pahurat');
  const thai = company('t1', 'Thai');
  const thaiBakery = company('t2', 'Thai bakery');
  const all = [annam, annamGroup, veganerie, veganerieCo, broccoli, broccoliSukhumvit, kemkon, kemkonPahurat, thai, thaiBakery];
  const contacts = [
    channel('k1', { phone: '0989188244' }),
    channel('k2', { phone: '+66-989188244' }),
    channel('a1', { line: '@annam' }),
    channel('a2', { line: 'Line OA @annam' }),
  ];

  it('pairs the same business entered twice, and nothing else', () => {
    const pairs = findDuplicatePairs(all, contacts);
    expect(names(pairs).sort()).toEqual([
      'Annam Gourmet + Annam Gourmet / An Nam Group',
      'Broccoli Revolution + Broccoli Revolution - Sukhumvit Rd',
      'Kem-Kon Pahurat + Kemkon',
      'Veganerie + Veganerie Corporation Co., Ltd.',
    ]);
  });

  it('says why, strongest evidence first, and which one looks like the main account', () => {
    const pairs = findDuplicatePairs(all, contacts);
    const byKey = new Map(pairs.map((p) => [p.key, p]));
    expect(byKey.get(pairKey('a1', 'a2'))!.reasons.map(reasonLabel)).toEqual(['Same name', 'LINE @annam']);
    expect(byKey.get(pairKey('k1', 'k2'))!.reasons.map(reasonLabel)).toEqual(['Phone 098 918 8244', 'Similar name']);
    expect(byKey.get(pairKey('k1', 'k2'))!.likelyParentId).toBe('k1');
    expect(byKey.get(pairKey('b1', 'b2'))!.likelyParentId).toBe('b1');
    expect(byKey.get(pairKey('v1', 'v2'))!.likelyParentId).toBeNull();
    // Two kinds of evidence outrank one; a likely branch sorts after a likely duplicate.
    expect(pairs[0].key).toBe(pairKey('a1', 'a2'));
    expect(pairs[pairs.length - 1].key).toBe(pairKey('b1', 'b2'));
  });

  it('pairs accounts that share a website domain', () => {
    const pairs = findDuplicatePairs([
      company('w1', 'Cold Storage', { website: 'https://coldstorage.com.sg' }),
      company('w2', 'CS Fresh', { website: 'shop.coldstorage.com.sg/fresh' }),
    ], []);
    expect(pairs.map((p) => p.reasons.map(reasonLabel))).toEqual([['Website coldstorage.com.sg']]);
  });

  it('leaves out pairs marked Not a duplicate, a branch with its main account, and sibling branches', () => {
    const dismissed = new Set([pairKey('v1', 'v2')]);
    const branch = { ...broccoliSukhumvit, parent_company_id: 'b1' };
    const sibling = company('b3', 'Broccoli Revolution - Thonglor', { parent_company_id: 'b1' });
    const pairs = findDuplicatePairs([veganerie, veganerieCo, broccoli, branch, sibling], [], dismissed);
    expect(pairs).toEqual([]);
  });
});

describe('merge helpers', () => {
  const history = historyByCompany(
    [
      { company_id: 'v1', identity_quality: 'named' },
      { company_id: 'v2', identity_quality: 'company_route' },
    ],
    [{ company_id: 'v1' }],
    [{ company_id: 'v1' }, { company_id: 'v1' }],
    Array.from({ length: 35 }, () => ({ company_id: 'v2' })),
  );

  it('counts what each account holds', () => {
    expect(historyLabels(history.get('v1')!)).toEqual(['1 person', '1 deal', '2 logged']);
    expect(historyLabels(history.get('v2')!)).toEqual(['1 channel', '35 orders']);
  });

  it('suggests keeping a customer, then the one with more history, then the older one', () => {
    const prospect = company('p', 'P', { status: 'prospect' });
    const customer = company('c', 'C', { status: 'active_customer' });
    expect(suggestedKeep(prospect, customer, history).id).toBe('c');
    expect(suggestedKeep(company('v1', 'A'), company('v2', 'B'), history).id).toBe('v2');
    expect(suggestedKeep(company('x', 'X', { created_at: '2026-09-02' }), company('y', 'Y', { created_at: '2026-08-01' }), history).id).toBe('y');
  });

  it('says what a merge moves and fills', () => {
    const keep = company('v1', 'Veganerie', { address: '1 Road' });
    const other = company('v2', 'Veganerie Corporation Co., Ltd.', { website: 'https://veganerie.co.th', address: '2 Road' });
    expect(mergeSummary(keep, other, history.get('v2')!)).toBe(
      'Moves to Veganerie: 1 channel, 35 orders. Fills website. Veganerie Corporation Co., Ltd. is archived and its name kept as an alias.',
    );
  });

  it('names a branch by what follows its main account', () => {
    expect(branchLabel({ name: 'Broccoli Revolution' }, { name: 'Broccoli Revolution - Sukhumvit Rd' })).toBe('Sukhumvit Rd');
    expect(branchLabel({ name: 'Kemkon' }, { name: 'Kem-Kon Pahurat' })).toBe('Kem-Kon Pahurat');
  });
});
