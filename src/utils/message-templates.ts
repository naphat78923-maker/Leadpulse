// ─── Outreach message drafts ───
// Pure. One short draft per buyer situation, worded after Pat's message library
// (2026-10-05): one fact about them, one proportionate ask. Facts the CRM does not hold
// (their menu item, a price, a dispatch date) are left as [blanks] for Pat to fill.
// Drafts are starting points Pat edits and sends himself; nothing here sends anything.

import { classifyCompanyRole, type ClassifiableCompany, type CompanyRole } from './companyRole';

export type TemplateKind =
  | 'first_approach'
  | 'nudge'
  | 'confirm_receipt'
  | 'nudge_receipt'
  | 'test_plan'
  | 'nudge_plan'
  | 'test_result'
  | 'nudge_test'
  | 'paid_trial'
  | 'first_order_quote'
  | 'check_in';
export type DraftLanguage = 'english' | 'thai';

export const TEMPLATE_KINDS: TemplateKind[] = [
  'first_approach', 'nudge', 'confirm_receipt', 'nudge_receipt', 'test_plan', 'nudge_plan', 'test_result', 'nudge_test',
  'paid_trial', 'first_order_quote', 'check_in',
];

export const TEMPLATE_LABEL: Record<TemplateKind, string> = {
  first_approach: 'First approach',
  nudge: 'Nudge: no reply to first approach',
  confirm_receipt: 'Sample sent: did it arrive?',
  nudge_receipt: 'Nudge: sample sent, no word',
  test_plan: 'Sample arrived: which recipe?',
  nudge_plan: 'Nudge: sample arrived, no test yet',
  test_result: 'Test done: how did it go?',
  nudge_test: 'Nudge: tested, no feedback',
  paid_trial: 'Second sample asked: paid trial',
  first_order_quote: 'Test passed: first-order quote',
  check_in: 'Customer check-in',
};

/**
 * The nudge sequence stops at four, and each stage a deal can stall at has its own four:
 * reminder, a new reason to reply, a yes-or-later question, then a calm exit with no ask.
 */
export const NUDGE_LIMIT = 4;

export function isNudge(kind: TemplateKind): boolean {
  return kind.startsWith('nudge');
}

/** Situations whose wording names the buyer's menu item or recipe. */
export const USES_APPLICATION: ReadonlySet<TemplateKind> = new Set(['first_approach', 'nudge', 'nudge_plan', 'test_result', 'nudge_test', 'first_order_quote']);

export interface SegmentPain {
  /** short name of the buyer segment */
  segment: string;
  /** what this kind of buyer needs from a dairy-free butter */
  pain: string;
}

const BAKERY: SegmentPain = { segment: 'Bakery and patisserie', pain: 'Plant-based butter has to laminate and taste like dairy in croissants and pastry.' };
const RESTAURANT: SegmentPain = { segment: 'Restaurant kitchens', pain: 'Dairy-free has to hold up on the plate: sauces, desserts and finishing.' };
const HOTEL: SegmentPain = { segment: 'Hotel kitchens', pain: 'Reliable dairy-free options for varied guest diets, across outlets and banquets.' };
const CATERING: SegmentPain = { segment: 'Catering', pain: 'Consistent dessert quality at volume, without dairy variability.' };
const RETAIL: SegmentPain = { segment: 'Retail', pain: 'A plant-based butter shoppers come back for: taste first, then label and pack.' };
const TRADE: SegmentPain = { segment: 'Importers and distributors', pain: 'A dairy-free butter line that chefs already ask for, easy to add to the range.' };
const MAKER: SegmentPain = { segment: 'Manufacturers and brands', pain: 'A dairy-free butter that runs in existing recipes and keeps the label clean.' };
const GENERAL: SegmentPain = { segment: 'General', pain: 'A dairy-free butter that performs like dairy for baking, cooking and spreading.' };

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
  /** the buyer's own menu item or recipe, typed by Pat; a [blank] when empty */
  application?: string | null;
  /** unanswered sends so far; picks which of the four nudges to draft */
  sendCount?: number;
}

export interface Draft {
  subject: string;
  body: string;
}

const BRAND = 'VG Saveur';
const WHOLESALE_LINK = 'https://vgsaveur.com/pages/wholesale';
// Named with Pat's go-ahead (2026-10-05). Butter only.
const PROOF: Record<DraftLanguage, string> = {
  english: "It's used at St. Regis and Le Cordon Bleu Dusit Thani.",
  thai: 'ตอนนี้มีใช้ที่ St. Regis และ Le Cordon Bleu Dusit Thani ครับ',
};

/** True while a draft still has a [blank] Pat must fill before sending. */
export function hasBlanks(body: string): boolean {
  return /\[[^\]\n]+\]/.test(body);
}

/** Which nudge a draft is, 1 to 4, from the unanswered sends so far. */
export function nudgeStep(sendCount: number | null | undefined): number {
  return Math.min(Math.max(Math.trunc(sendCount ?? 1), 1), NUDGE_LIMIT);
}

const isCondensedMilk = (product: string | null | undefined) => product?.trim().toLowerCase() === 'condensed milk';

export function buildDraft(input: DraftInput): Draft {
  const first = input.contactName?.trim().split(/\s+/)[0];
  const company = input.companyName.trim();
  const milk = isCondensedMilk(input.product);
  const app = input.application?.trim();
  const step = nudgeStep(input.sendCount);

  if (input.language === 'thai') {
    // A space after คุณ only before a Latin-script name.
    const hello = first ? `สวัสดีครับคุณ${THAI_SCRIPT.test(first) ? '' : ' '}${first}` : 'สวัสดีครับ';
    const product = milk ? 'นมข้นหวานจากพืช' : 'เนย dairy-free';
    const sample = milk ? 'ตัวอย่างฟรี' : 'ตัวอย่างฟรีขนาด 500 กรัม 2 ก้อน';
    const forApp = app ? `สำหรับ ${app} ` : '';
    switch (input.kind) {
      case 'nudge':
        return { subject: `${BRAND} x ${company || BRAND}`, body: [
            `${hello} ขออนุญาตติดตามข้อความก่อนหน้าเรื่อง${product}${app ? ` สำหรับ ${app}` : ''} ครับ สนใจให้ผมส่ง${sample}ให้ทีมครัวลองไหมครับ`,
            `${hello} ขออนุญาตติดตามอีกครั้งนะครับ ถ้าเริ่มลองกับ ${app || 'เมนูเดียว'} ก่อน ก็ไม่ต้องเปลี่ยนทั้งไลน์เมนูครับ สนใจให้ผมส่ง${sample}สำหรับทดลองไหมครับ`,
            `${hello} ทีมยังสนใจลอง${product} ${forApp}อยู่ไหมครับ หรือสะดวกให้ผมติดต่อกลับในช่วงที่เหมาะกว่านี้ครับ`,
            `${hello} ผมขอพักเรื่อง${product} ไว้ก่อนนะครับ หากในอนาคตสนใจ${app ? `นำไปใช้กับ ${app} ` : ' '}สามารถทักมาได้ครับ`,
        ][step - 1] };
      case 'nudge_receipt':
        return { subject: `${BRAND} sample`, body: [
          `${hello} ขออนุญาตสอบถามเรื่องตัวอย่าง${product} ที่ส่งไปครับ ถึงครัวเรียบร้อยไหมครับ`,
          `${hello} เผื่อตัวอย่าง${product} ไปอยู่ที่แผนกอื่นหรือหน้าเคาน์เตอร์ ผมควรสอบถามกับท่านใดดีครับ`,
          `${hello} ตัวอย่าง${product} ได้รับแล้วหรือยังครับ หรือให้ผมตรวจสอบกับบริษัทขนส่งทางฝั่งผมดีครับ`,
          `${hello} ผมขอพักเรื่องตัวอย่างไว้ก่อนนะครับ หากยังไม่ได้รับ หรือทีมอยากทดลองภายหลัง สามารถทักมาได้ครับ`,
        ][step - 1] };
      case 'nudge_plan':
        return { subject: `${BRAND} sample`, body: [
          `${hello} ขออนุญาตติดตามเรื่องตัวอย่าง${product} ครับ ทีมอยากลองกับเมนูไหนก่อนครับ`,
          `${hello} ขอเสนอแนวทางครับ ลองกับ ${app || 'เมนูเดิมเมนูเดียว'} เพียงรอบเดียวก็พอประเมินได้แล้ว แบบนี้สะดวกสำหรับทีมไหมครับ`,
          `${hello} ทีมยังมีแผนทดลองตัวอย่าง${product} อยู่ไหมครับ หรือสะดวกให้ผมติดต่อกลับในช่วงที่เหมาะกว่านี้ครับ`,
          `${hello} ผมขอฝากตัวอย่าง${product} ไว้ก่อนนะครับ หากทีมได้ทดลองภายหลัง ยินดีรับฟังผลเสมอครับ`,
        ][step - 1] };
      case 'nudge_test':
        return { subject: `${BRAND} sample`, body: [
          `${hello} ขออนุญาตติดตามผลทดลอง${product}${app ? ` กับ ${app}` : ''} ครับ เป็นอย่างไรบ้างครับ`,
          `${hello} ตอบสั้น ๆ ได้เลยครับ ${product}${app ? ` กับ ${app}` : ''} ใช้ได้ดี ยังไม่ลงตัว หรือยังไม่ได้ทดลองครับ`,
          `${hello} ทีมยังสะดวกแจ้งผลทดลอง${product} อยู่ไหมครับ หรือสะดวกให้ผมติดต่อกลับในช่วงที่เหมาะกว่านี้ครับ`,
          `${hello} ผมขอพักเรื่องผลทดลอง${product} ไว้ก่อนนะครับ หากทีมมีความเห็นภายหลัง สามารถทักมาได้ครับ`,
        ][step - 1] };
      case 'confirm_receipt':
        return { subject: `${BRAND} sample`, body: `${hello} ตัวอย่าง${product} ที่ส่งไปเมื่อ [วันที่ส่ง] ได้รับเรียบร้อยไหมครับ` };
      case 'test_plan':
        return { subject: `${BRAND} sample`, body: `${hello} ทีมอยากลองตัวอย่าง${product} กับเมนูไหนก่อนครับ` };
      case 'test_result':
        return { subject: `${BRAND} sample`, body: `${hello} ผลทดลอง${product} กับ ${app || '[เมนูที่ทดลอง]'} เป็นอย่างไรบ้างครับ` };
      case 'paid_trial':
        return {
          subject: `${BRAND} paid trial`,
          body: `${hello} ก่อนหน้านี้ผมส่งตัวอย่างให้ทดลองไปแล้ว 1 รอบนะครับ\n\nถ้าต้องการทดลองเพิ่มเติม รอบนี้ผมแนะนำเป็นออเดอร์ทดลอง [ขนาด] ราคา [ราคา] ครับ\n\nสนใจให้ผมจัดเป็นออเดอร์ทดลองไหมครับ`,
        };
      case 'first_order_quote':
        return {
          subject: `${BRAND} first order`,
          body: `${hello} ดีใจที่${product} ใช้ได้กับ ${app || '[เมนูที่ทดลอง]'} นะครับ สะดวกให้ผมเตรียมใบเสนอราคาสำหรับการผลิตรอบถัดไปไหมครับ`,
        };
      case 'check_in':
        return {
          subject: `${BRAND} order`,
          body: `${hello} แพทจาก ${BRAND} ครับ ช่วงนี้ต้องการ${product} เพิ่มไหมครับ แจ้งจำนวนได้เลย ผมจะจัดส่งให้ครับ`,
        };
      default:
        return {
          subject: `${BRAND} x ${company || BRAND}`,
          body: `${hello} ผมแพทจาก ${BRAND} ครับ เห็นว่าทางร้านมี ${app || '[เมนู]'} เลยคิดว่า${product} อาจน่าลองกับเมนูนี้ครับ สนใจรับ${sample}สำหรับทดลองไหมครับ`
            + `\n\n${milk ? '' : `${PROOF.thai}\n`}${WHOLESALE_LINK}`,
        };
    }
  }

  const hello = first ? `Hi ${first},` : company ? `Hi ${company} team,` : 'Hi there,';
  const product = milk ? 'plant-based condensed milk' : 'dairy-free butter';
  const sample = milk ? `free sample of our ${product}` : `free 2 × 500g sample of our ${product}`;
  const forApp = app ? ` for ${app}` : '';
  const theSample = milk ? 'a free sample' : 'the free 2 × 500g sample';
  switch (input.kind) {
    case 'nudge':
      return { subject: `${BRAND} x ${company || BRAND}`, body: [
        `${hello} following up on my message about ${product}${forApp}. Would you like me to send ${theSample} for your kitchen to try?`,
        `${hello} one more thought. Testing in just ${app || 'one recipe'} keeps it simple: nothing else on your menu has to change. Shall I send ${theSample} for that?`,
        `${hello} is the team still interested in trying ${product}${forApp}, or would it be better if I came back at a later time?`,
        `${hello} I'll leave the ${product} discussion here for now. If it becomes relevant${forApp} later, you're welcome to message me.`,
      ][step - 1] };
    case 'nudge_receipt':
      return { subject: `Your ${BRAND} sample`, body: [
        `${hello} checking on the ${product} sample I sent. Has it reached your kitchen?`,
        `${hello} in case the ${product} sample was left at reception or with another team: who should I ask about it?`,
        `${hello} has the ${product} sample arrived, or should I check with the courier on my side?`,
        `${hello} I'll leave the sample here for now. If it hasn't turned up, or the team would like to test later, you're welcome to message me.`,
      ][step - 1] };
    case 'nudge_plan':
      return { subject: `Your ${BRAND} sample`, body: [
        `${hello} following up on the ${product} sample. Which recipe would the team like to try it in first?`,
        `${hello} one idea for the sample: a single batch of ${app || 'one existing recipe'} is enough to judge it. Would that work for the team?`,
        `${hello} is the team still planning to test the ${product} sample, or would it be better if I came back at a later time?`,
        `${hello} I'll leave the ${product} sample with you for now. If the team tests it later, I'd be glad to hear how it goes.`,
      ][step - 1] };
    case 'nudge_test':
      return { subject: `Your ${BRAND} sample`, body: [
        `${hello} following up on the ${product} test${app ? ` in ${app}` : ''}. How did it go?`,
        `${hello} a one-line answer is fine: did the ${product} work${app ? ` in ${app}` : ''}, not quite, or not tested yet?`,
        `${hello} is feedback on the ${product} test still coming, or would it be better if I came back at a later time?`,
        `${hello} I'll leave the ${product} test here for now. If the team has feedback later, you're welcome to message me.`,
      ][step - 1] };
    case 'confirm_receipt':
      return { subject: `Your ${BRAND} sample`, body: `${hello} I sent the ${product} sample on [date sent]. Has it arrived safely?` };
    case 'test_plan':
      return { subject: `Your ${BRAND} sample`, body: `${hello} which recipe would the team like to try the ${product} sample in first?` };
    case 'test_result':
      return { subject: `Your ${BRAND} sample`, body: `${hello} how did the ${product} perform in ${app || '[recipe tested]'} during the test?` };
    case 'paid_trial':
      return {
        subject: `${BRAND} paid trial`,
        body: `${hello} we've already provided the initial sample. For further testing, I'd suggest a paid trial: [pack size] at [price]. Would you like me to prepare one?`,
      };
    case 'first_order_quote':
      return {
        subject: `${BRAND} first order`,
        body: `${hello} glad the ${product} worked for ${app || '[recipe tested]'}. Would you like me to prepare a first-order quote for your next production batch?`,
      };
    case 'check_in':
      return {
        subject: `${BRAND} order`,
        body: `${hello} Pat from ${BRAND} here. Do you need more ${product} for the coming weeks? Tell me the quantity and I'll arrange delivery.`,
      };
    default:
      return {
        subject: `${BRAND} x ${company || BRAND}`,
        body: `${hello} Pat from ${BRAND} here. I saw ${app || '[menu item]'} on your menu. Would a ${sample} be useful to test with it?`
          + `\n\n${milk ? '' : `${PROOF.english}\n`}${WHOLESALE_LINK}`,
      };
  }
}

/**
 * The situation that fits where the deal is. A guess Pat can change: the CRM does not know
 * whether a test happened or passed, so paid trial and quote are never picked for him.
 */
export function defaultTemplateKind(input: {
  lane?: string | null;
  companyStatus?: string | null;
  sampleStatus?: string | null;
  sendCount?: number;
}): TemplateKind {
  const chasing = (input.sendCount ?? 0) > 0;
  const customer = input.companyStatus === 'active_customer';
  // Lanes: sample = tracking delivery, testing = delivered and the test is to be booked,
  // reschedule (Follow-up) = feedback due.
  if (input.lane === 'sample' && input.sampleStatus !== 'received') return chasing ? 'nudge_receipt' : 'confirm_receipt';
  if (input.lane === 'sample' || input.lane === 'testing') return chasing ? 'nudge_plan' : 'test_plan';
  if (input.lane === 'reschedule' && !customer) return chasing ? 'nudge_test' : 'test_result';
  if (customer) return 'check_in';
  return chasing ? 'nudge' : 'first_approach';
}

const THAI_SCRIPT = /[฀-๿]/;

/**
 * Thai for Thai buyers. In order: the language set on the contact, the language the buyer
 * last wrote in, English for hotels (Pat, 2026-10-05), a Thai-script name, then any sign
 * the account is in Thailand.
 */
export function defaultDraftLanguage(input: {
  contactLanguage?: string | null;
  buyerReply?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  company?: { name?: string | null; industry?: string | null; address?: string | null; website?: string | null; tags?: string[] | null } | null;
}): DraftLanguage {
  if (input.contactLanguage === 'thai' || input.contactLanguage === 'english') return input.contactLanguage;
  const reply = input.buyerReply?.trim();
  if (reply) return THAI_SCRIPT.test(reply) ? 'thai' : 'english';
  const c = input.company;
  if (c && classifyCompanyRole(c).role === 'foodservice_hotel') return 'english';
  if (THAI_SCRIPT.test(`${input.contactName ?? ''}${c?.name ?? ''}`)) return 'thai';
  if (/thai|bangkok|[฀-๿]/i.test(`${c?.address ?? ''} ${(c?.tags ?? []).join(' ')}`)) return 'thai';
  if (/\.th(\/|$)/i.test(c?.website?.trim() ?? '')) return 'thai';
  if (/^(\+?66|0\d)/.test(input.contactPhone?.replace(/[\s-]/g, '') ?? '')) return 'thai';
  return 'english';
}
