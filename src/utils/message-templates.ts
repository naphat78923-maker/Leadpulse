// ─── Outreach message drafts ───
// Pure. A draft is: one line about the buyer's likely problem (from the account's role),
// one line about VG Saveur, and one small ask. Drafts are starting points Pat edits and
// sends himself; nothing here sends anything.

import { classifyCompanyRole, type ClassifiableCompany, type CompanyRole } from './companyRole';

export type TemplateKind = 'first_outreach' | 'sample_followup' | 'check_in';
export type DraftLanguage = 'english' | 'thai';

export const TEMPLATE_LABEL: Record<TemplateKind, string> = {
  first_outreach: 'First outreach',
  sample_followup: 'Sample follow-up',
  check_in: 'Customer check-in',
};

export interface SegmentPain {
  /** short name of the buyer segment */
  segment: string;
  /** what this kind of buyer needs from a dairy-free butter */
  pain: string;
  /** the same point as an opening line, per language */
  opener: Record<DraftLanguage, string>;
}

const BAKERY: SegmentPain = {
  segment: 'Bakery and patisserie',
  pain: 'Plant-based butter has to laminate and taste like dairy in croissants and pastry.',
  opener: {
    english: 'I imagine a plant-based butter only earns a place in your kitchen if it laminates and tastes like dairy.',
    thai: 'เข้าใจว่าเนยจากพืชจะได้ใช้จริงในครัวของคุณก็ต่อเมื่อรีดแป้งได้ดีและรสชาติใกล้เคียงเนยนม',
  },
};
const RESTAURANT: SegmentPain = {
  segment: 'Restaurant kitchens',
  pain: 'Dairy-free has to hold up on the plate: sauces, desserts and finishing.',
  opener: {
    english: 'I imagine dairy-free only works for your menu if it holds up on the plate, in sauces and desserts alike.',
    thai: 'เข้าใจว่าวัตถุดิบปลอดนมจะเหมาะกับเมนูของคุณก็ต่อเมื่อใช้ได้ดีทั้งในซอสและของหวาน',
  },
};
const HOTEL: SegmentPain = {
  segment: 'Hotel kitchens',
  pain: 'Reliable dairy-free options for varied guest diets, across outlets and banquets.',
  opener: {
    english: 'I imagine your kitchens need a dairy-free option that stays reliable across outlets and banquets.',
    thai: 'เข้าใจว่าครัวของโรงแรมต้องการตัวเลือกปลอดนมที่คุณภาพสม่ำเสมอ ทั้งในห้องอาหารและงานจัดเลี้ยง',
  },
};
const CATERING: SegmentPain = {
  segment: 'Catering',
  pain: 'Consistent dessert quality at volume, without dairy variability.',
  opener: {
    english: 'I imagine consistency at volume matters most for you, especially for desserts.',
    thai: 'เข้าใจว่าความสม่ำเสมอเมื่อผลิตจำนวนมากคือสิ่งสำคัญที่สุดสำหรับคุณ โดยเฉพาะของหวาน',
  },
};
const RETAIL: SegmentPain = {
  segment: 'Retail',
  pain: 'A plant-based butter shoppers come back for: taste first, then label and pack.',
  opener: {
    english: 'I imagine a plant-based butter only stays on your shelf if shoppers come back for the taste.',
    thai: 'เข้าใจว่าเนยจากพืชจะอยู่บนชั้นวางได้นานก็ต่อเมื่อลูกค้ากลับมาซื้อซ้ำเพราะรสชาติ',
  },
};
const TRADE: SegmentPain = {
  segment: 'Importers and distributors',
  pain: 'A dairy-free butter line that chefs already ask for, easy to add to the range.',
  opener: {
    english: 'I imagine you look for lines your chef and bakery customers already ask for.',
    thai: 'เข้าใจว่าคุณมองหาสินค้าที่ลูกค้ากลุ่มเชฟและเบเกอรี่ถามหาอยู่แล้ว',
  },
};
const MAKER: SegmentPain = {
  segment: 'Manufacturers and brands',
  pain: 'A dairy-free butter that runs in existing recipes and keeps the label clean.',
  opener: {
    english: 'I imagine a dairy-free butter has to work in your existing recipes without changing the label much.',
    thai: 'เข้าใจว่าเนยปลอดนมต้องใช้กับสูตรเดิมของคุณได้ โดยไม่กระทบฉลากมากนัก',
  },
};
const GENERAL: SegmentPain = {
  segment: 'General',
  pain: 'A dairy-free butter that performs like dairy for baking, cooking and spreading.',
  opener: {
    english: 'I imagine a dairy-free butter is only useful to you if it performs like dairy.',
    thai: 'เข้าใจว่าเนยปลอดนมจะมีประโยชน์กับคุณก็ต่อเมื่อใช้งานได้เหมือนเนยนม',
  },
};

const PAIN_BY_ROLE: Record<CompanyRole, SegmentPain> = {
  bakery_chain: BAKERY,
  patisserie_chain: BAKERY,
  foodservice_restaurant: RESTAURANT,
  cloud_kitchen: RESTAURANT,
  foodservice_hotel: HOTEL,
  catering: CATERING,
  modern_trade_retail: RETAIL,
  importer: TRADE,
  distributor: TRADE,
  wholesaler: TRADE,
  manufacturer: MAKER,
  brand_owner: MAKER,
  unknown: GENERAL,
};

/** The pain line for an account, from its classified role; General when there is no account. */
export function segmentPainFor(company: ClassifiableCompany | null | undefined): SegmentPain {
  if (!company) return GENERAL;
  return PAIN_BY_ROLE[classifyCompanyRole(company).role] ?? GENERAL;
}

export interface DraftInput {
  kind: TemplateKind;
  language: DraftLanguage;
  companyName: string;
  /** a person's name; omitted for company routes and unknown contacts */
  contactName?: string | null;
  product?: string | null;
  pain: SegmentPain;
}

export interface Draft {
  subject: string;
  body: string;
}

const SENDER = 'Pat';
const BRAND = 'VG Saveur';

/** "Butter" → "butter"; "Both" and blanks fall back to the generic product name. */
function productPhrase(product: string | null | undefined, language: DraftLanguage): string {
  const p = product?.trim().toLowerCase();
  if (language === 'thai') {
    if (p === 'condensed milk') return 'นมข้นหวานจากพืช';
    return 'เนยปลอดนม';
  }
  if (p === 'condensed milk') return 'plant-based condensed milk';
  return 'dairy-free butter';
}

export function buildDraft(input: DraftInput): Draft {
  const first = input.contactName?.trim().split(/\s+/)[0];
  const product = productPhrase(input.product, input.language);
  const company = input.companyName.trim() || 'your team';

  if (input.language === 'thai') {
    const hello = first ? `สวัสดีครับคุณ${first}` : 'สวัสดีครับ';
    const bye = `ขอบคุณครับ\n${SENDER}`;
    if (input.kind === 'sample_followup') {
      return {
        subject: `ตัวอย่าง${product}จาก ${BRAND}`,
        body: `${hello}\n\nหวังว่าตัวอย่าง${product}จะถึงเรียบร้อยดีนะครับ ทีมได้ลองใช้แล้วเป็นอย่างไรบ้างครับ ทั้งเนื้อสัมผัส รสชาติ หรือจุดที่อยากให้ปรับ\n\nหากต้องการสเปกสินค้าหรือให้ผมเข้าไปพบ ยินดีเลยครับ สะดวกให้ผมติดต่อฟังความเห็นของทีมช่วงไหนดีครับ\n\n${bye}`,
      };
    }
    if (input.kind === 'check_in') {
      return {
        subject: `${BRAND} สอบถามสต็อก`,
        body: `${hello}\n\nไม่ได้ติดต่อกันสักพักแล้วครับ ตอนนี้สต็อก${product}ที่ ${company} เป็นอย่างไรบ้างครับ\n\nผมจัดส่งรอบถัดไปให้ได้ตามวันที่สะดวก แจ้งจำนวนที่ต้องการได้เลยครับ\n\n${bye}`,
      };
    }
    return {
      subject: `${BRAND} x ${company}`,
      body: `${hello}\n\n${input.pain.opener.thai}\n\nผม${SENDER}จาก ${BRAND} แบรนด์ไทยที่ทำ${product}สำหรับงานเบเกอรี่ ทำอาหาร และทาขนมปังครับ\n\nยินดีส่งตัวอย่างเล็ก ๆ ให้ทีมได้ทดลองก่อนตัดสินใจ ให้ผมส่งไปให้ไหมครับ\n\n${bye}`,
    };
  }

  const hello = first ? `Hi ${first},` : 'Hi there,';
  const bye = `Best,\n${SENDER}`;
  if (input.kind === 'sample_followup') {
    return {
      subject: `Your ${BRAND} sample`,
      body: `${hello}\n\nI hope the ${product} sample arrived well. How did it perform in your kitchen: texture, flavour, anything you'd change?\n\nIf it helps, I can send the spec sheet or come by. When would be a good time to hear your team's feedback?\n\n${bye}`,
    };
  }
  if (input.kind === 'check_in') {
    return {
      subject: `${BRAND} stock check`,
      body: `${hello}\n\nIt's been a while since we last spoke. How is your ${product} stock at ${company}?\n\nI can arrange the next delivery whenever suits you. Just tell me the quantity.\n\n${bye}`,
    };
  }
  return {
    subject: `${BRAND} x ${company}`,
    body: `${hello}\n\n${input.pain.opener.english}\n\nI'm ${SENDER} from ${BRAND}, a Thai brand making ${product} for baking, cooking and spreading.\n\nHappy to send a small sample so your team can test it before committing to anything. Want me to send one over?\n\n${bye}`,
  };
}

/** The template that fits where the deal is: check-in for customers, sample follow-up after a sample. */
export function defaultTemplateKind(input: { lane?: string | null; companyStatus?: string | null }): TemplateKind {
  if (input.lane === 'sample' || input.lane === 'testing') return 'sample_followup';
  if (input.companyStatus === 'active_customer') return 'check_in';
  return 'first_outreach';
}
