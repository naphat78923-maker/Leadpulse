// ─── Outreach message drafts ───
// Pure. One short draft per buyer situation, worded after Pat's message library
// (2026-10-05) and the copy review of 2026-10-06: one fact about them, one proportionate
// ask. Facts the CRM does not hold (their menu item, a price, a dispatch date) are left as
// [blanks] for Pat to fill.
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

const TRADE_SEGMENTS: ReadonlySet<SegmentPain> = new Set([TRADE, RETAIL]);

/** Importers, distributors, wholesalers and retailers resell: they have a range, not a menu. */
export function isTradeAccount(company: ClassifiableCompany | null | undefined): boolean {
  return TRADE_SEGMENTS.has(segmentPainFor(company));
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
  /** true for accounts that resell: the draft speaks of their range, not their menu */
  trade?: boolean;
  /** unanswered sends so far; picks which of the four nudges to draft */
  sendCount?: number;
}

export interface Draft {
  subject: string;
  body: string;
}

const BRAND = 'VG Saveur';
const HOME_LINK = 'https://vgsaveur.com';
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
  const trade = input.trade === true;
  const intro = `${BRAND} x ${company || BRAND}`;

  if (input.language === 'thai') {
    // A space after คุณ only before a Latin-script name.
    const hello = first ? `สวัสดีครับคุณ${THAI_SCRIPT.test(first) ? '' : ' '}${first}` : 'สวัสดีครับ';
    const product = milk ? 'นมข้นหวานจากพืช' : 'เนย dairy-free';
    // Follow-ups name the brand too; always followed by a space before Thai text.
    const ours = `${product} ${BRAND}`;
    const sample = 'ตัวอย่างฟรีขนาด 500 กรัม 2 ก้อน';
    const later = 'หรือสะดวกให้ผมติดต่อกลับในช่วงที่เหมาะกว่านี้ครับ';
    const withApp = app ? ` กับ ${app}` : '';
    switch (input.kind) {
      case 'nudge':
        return { subject: intro, body: (trade ? [
          milk
            ? `${hello} ขออนุญาตติดตามเรื่อง${ours} ที่เคยแนะนำไว้ครับ สนใจให้ผมส่งข้อมูลสินค้าให้ทีมพิจารณาเพิ่มเติมไหมครับ`
            : `${hello} ขออนุญาตติดตามข้อความก่อนหน้าเรื่อง${product} ครับ สนใจให้ผมส่ง${sample}ให้ทีมพิจารณาไหมครับ`,
          `${hello} มีข้อมูลเรื่อง [ข้อมูลใหม่ที่เกี่ยวข้อง] เพิ่มเติมที่น่าจะช่วยให้ทีมพิจารณาว่า${ours} เหมาะกับกลุ่มลูกค้าของคุณไหมครับ สนใจให้ผมส่งให้ดูไหมครับ`,
          `${hello} ทีมยังสนใจพิจารณา${ours} เป็นตัวเลือกในกลุ่มสินค้าของคุณอยู่ไหมครับ ${later}`,
          `${hello} ผมขอพักเรื่อง${ours} ไว้ก่อนนะครับ หากในอนาคตอยากกลับมาพิจารณาสินค้าตัวนี้ ทักผมได้เลยครับ`,
        ] : [
          milk
            ? `${hello} ขออนุญาตติดตามข้อความก่อนหน้าเรื่อง${ours}${app ? ` สำหรับ ${app}` : ''} ครับ สนใจให้ผมส่งข้อมูลสินค้า${app ? 'สำหรับเมนูนี้' : ''}เพิ่มเติมไหมครับ`
            : `${hello} ขออนุญาตติดตามข้อความก่อนหน้าเรื่อง${product}${app ? ` สำหรับ ${app}` : ''} ครับ สนใจให้ผมส่ง${sample}ให้ทีมครัวลองไหมครับ`,
          `${hello} มีข้อมูลเรื่อง [ข้อมูลใหม่ที่เกี่ยวข้อง] ที่น่าจะเกี่ยวข้องกับการใช้${ours}${app ? ` ใน ${app}` : ''} ครับ สนใจให้ผมส่งให้ทีมดูไหมครับ`,
          `${hello} ทางทีมยังสนใจพิจารณา${ours}${app ? ` สำหรับ ${app}` : ''} อยู่ไหมครับ ${later}`,
          `${hello} ผมขอพักเรื่อง${ours}${app ? ` สำหรับ ${app}` : ''} ไว้ก่อนนะครับ หากในอนาคตสนใจ${app ? 'นำไปใช้กับเมนูนี้' : ''} ทักผมได้เลยครับ`,
        ])[step - 1] };
      case 'nudge_receipt':
        return { subject: `${BRAND} sample`, body: [
          `${hello} ขออนุญาตติดตามเรื่องตัวอย่าง${ours} ที่ส่งไปครับ ทางทีมได้รับเรียบร้อยไหมครับ`,
          `${hello} ผมส่งลิงก์ติดตามตัวอย่าง${ours} ไว้ตรงนี้นะครับ\n[ลิงก์ติดตามพัสดุ]\n\nทางทีมได้รับของแล้วหรือยังครับ`,
          `${hello} ขออนุญาตเช็กเรื่องตัวอย่าง${ours} อีกครั้งครับ ตอนนี้ได้รับแล้วหรือยังครับ ถ้ายังไม่ถึง ผมจะได้ตรวจสอบเรื่องการจัดส่งให้ครับ`,
          `${hello} เรื่องตัวอย่าง${ours} หากของยังไม่ถึงหรือมีปัญหาในการรับสินค้า แจ้งผมได้เลยนะครับ`,
        ][step - 1] };
      case 'nudge_plan':
        return { subject: `${BRAND} sample`, body: [
          `${hello} ขออนุญาตติดตามเรื่องตัวอย่าง${ours} ครับ ทีมสะดวกเริ่มทดลอง${app ? `กับ ${app} ` : ''}ช่วงไหนครับ`,
          `${hello} ถ้าทีมอยากเริ่มจาก ${app || '[เมนู]'} ก่อน ผมช่วยตรวจสอบข้อมูลสินค้าที่เกี่ยวข้องให้ได้ครับ มีข้อมูลส่วนไหนที่ต้องการก่อนเริ่มทดลองไหมครับ`,
          `${hello} ทางทีมยังมีแผนทดลอง${ours}${withApp} อยู่ไหมครับ ${later}`,
          `${hello} ผมขอพักการติดตามเรื่องทดลอง${ours}${withApp} ไว้ก่อนนะครับ หากทีมพร้อมเริ่มทดลองเมื่อไร ทักผมได้เลยครับ`,
        ][step - 1] };
      case 'nudge_test':
        return { subject: `${BRAND} sample`, body: [
          `${hello} ขออนุญาตติดตามผลทดลอง${ours}${withApp} ครับ ผลเป็นอย่างไรบ้างครับ`,
          `${hello} ขออนุญาตสอบถามผลทดลอง${ours}${withApp} เพิ่มเติมครับ โดยรวมเหมาะกับเมนูนี้ไหมครับ หากมีจุดที่ยังไม่ลงตัว บอกผมได้เลยครับ`,
          `${hello} ขออนุญาตติดตามผลทดลอง${ours}${withApp} ครับ สะดวกแชร์ผลคร่าว ๆ ไหมครับ หรืออยากให้ผมติดต่อกลับในช่วงที่เหมาะกว่านี้ครับ`,
          `${hello} ผมขอพักการติดตามผลทดลอง${ours}${withApp} ไว้ก่อนนะครับ หากทีมมีผลหรือข้อสังเกตเพิ่มเติมเมื่อไร ส่งให้ผมได้เลยครับ`,
        ][step - 1] };
      case 'confirm_receipt':
        return { subject: `${BRAND} sample`, body: `${hello} ตัวอย่าง${ours} ที่ส่งไปเมื่อ [วันที่ส่ง] ได้รับเรียบร้อยไหมครับ` };
      case 'test_plan':
        return { subject: `${BRAND} sample`, body: `${hello} สำหรับตัวอย่าง${ours} ที่ได้รับ ทีมอยากเริ่มลองกับเมนูไหนก่อนครับ` };
      case 'test_result':
        return { subject: `${BRAND} sample`, body: `${hello} ผลทดลอง${ours} กับ ${app || '[เมนูที่ทดลอง]'} เป็นอย่างไรบ้างครับ มีจุดไหนที่ทีมอยากให้ช่วยดูเพิ่มเติม แจ้งผมได้เลยครับ` };
      case 'paid_trial':
        // Kept close to the reply Pat approved on 2026-09-21.
        return {
          subject: `${BRAND} paid trial`,
          body: `${hello} ก่อนหน้านี้ผมส่งตัวอย่างให้ทดลองไปแล้ว 1 รอบนะครับ\n\nถ้าต้องการทดลองเพิ่มเติม รอบนี้ผมแนะนำเป็นออเดอร์ทดลอง [ขนาด] ราคา [ราคา] ครับ\n\nสนใจให้ผมจัดเป็นออเดอร์ทดลองไหมครับ`,
        };
      case 'first_order_quote':
        return {
          subject: `${BRAND} first order`,
          body: `${hello} ดีใจที่${ours} ใช้ได้กับ ${app || '[เมนูที่ทดลอง]'} นะครับ หากทีมจะนำไปใช้ในการผลิตรอบถัดไป สะดวกให้ผมเตรียมใบเสนอราคาสำหรับออเดอร์แรกไหมครับ`,
        };
      case 'check_in':
        return {
          subject: `${BRAND} order`,
          body: `${hello} แพทจาก ${BRAND} ครับ ช่วงนี้${trade ? 'ทางบริษัท' : 'ทางร้าน'}มีแผนสั่ง${ours} เพิ่มไหมครับ หากมี ผมช่วยเช็กขนาดและรายละเอียดการสั่งซื้อให้ได้ครับ`,
        };
      default:
        // Condensed milk: no free sample; ask how they would use it first.
        if (milk) {
          return { subject: intro, body: trade
            ? `${hello}\nผมแพทจาก ${BRAND} (${HOME_LINK}) ครับ เห็นว่าทางบริษัทมีจำหน่าย ${app || '[สินค้าที่จำหน่าย]'} เลยอยากแนะนำ${product}ของเราให้พิจารณาครับ\n\nทีมอยากนำเสนอสินค้าตัวนี้ให้ลูกค้ากลุ่มไหนเป็นหลักครับ`
            : `${hello}\nผมแพทจาก ${BRAND} (${HOME_LINK}) ครับ เห็นว่าทางร้านมี ${app || '[เมนู]'} เลยอยากแนะนำ${product}ของเราครับ\n\nหากทีมสนใจพิจารณา อยากลองนำไปใช้ในส่วนไหนของเมนูนี้ครับ` };
        }
        return { subject: intro, body: (trade
          ? `${hello} ผมแพทจาก ${BRAND} ครับ เห็นว่าทางบริษัทมีจำหน่าย ${app || '[สินค้าที่จำหน่าย]'} เลยคิดว่า${product} อาจเหมาะกับกลุ่มสินค้าของคุณครับ สนใจรับ${sample}เพื่อพิจารณาไหมครับ`
          : `${hello} ผมแพทจาก ${BRAND} ครับ เห็นว่าทางร้านมี ${app || '[เมนู]'} เลยคิดว่า${product} อาจน่าลองกับเมนูนี้ครับ สนใจรับ${sample}สำหรับทดลองไหมครับ`)
          + `\n\n${PROOF.thai}\n${WHOLESALE_LINK}` };
    }
  }

  const hello = first ? `Hi ${first},` : company ? `Hi ${company} team,` : 'Hi there,';
  const product = milk ? 'plant-based condensed milk' : 'dairy-free butter';
  // Follow-ups name the brand too.
  const ours = `${BRAND} ${product}`;
  const theSample = 'the free 2 × 500g sample';
  const later = 'or would it be better for me to reconnect at a later time?';
  const forApp = app ? ` for ${app}` : '';
  const inApp = app ? ` in ${app}` : '';
  switch (input.kind) {
    case 'nudge':
      return { subject: intro, body: (trade ? [
        milk
          ? `${hello} following up on the ${ours} I mentioned earlier. Would you like the product details for your team to review?`
          : `${hello} following up on my message about ${product}. Would you like me to send ${theSample} for your team to assess?`,
        `${hello} I have some information on [new relevant information] that may help your team assess whether ${ours} fits your customers. Would you like me to send it over?`,
        `${hello} is the team still interested in assessing ${ours} for your range, ${later}`,
        `${hello} I'll leave the ${ours} discussion here for now. If you'd like to assess it for your range later, you're welcome to message me.`,
      ] : [
        milk
          ? `${hello} following up on my earlier message about ${ours}${forApp}. Would the product details${app ? ' for that recipe' : ''} be useful?`
          : `${hello} following up on my message about ${product}${forApp}. Would you like me to send ${theSample} for your kitchen to try?`,
        `${hello} I have some information on [new relevant information] that may be useful when assessing ${ours}${forApp}. Would you like me to send it over?`,
        `${hello} would the team still be interested in assessing ${ours}${forApp}, ${later}`,
        `${hello} I'll leave the ${ours} discussion here for now. If it becomes relevant${forApp} later, you're welcome to message me.`,
      ])[step - 1] };
    case 'nudge_receipt':
      return { subject: `Your ${BRAND} sample`, body: [
        `${hello} following up on the ${ours} sample I sent. Has your team received it?`,
        `${hello} here's the tracking link for the ${ours} sample: [tracking link]. Has it reached your team yet?`,
        `${hello} checking once more on the ${ours} sample. Has it arrived? If not, I can check the delivery status.`,
        `${hello} if the ${ours} sample hasn't arrived or there's a delivery issue, please let me know.`,
      ][step - 1] };
    case 'nudge_plan':
      return { subject: `Your ${BRAND} sample`, body: [
        `${hello} following up on the ${ours} sample${forApp}. When would the team be able to start the test?`,
        `${hello} if the team would like to start with ${app || '[recipe]'}, I can check the relevant product details. Is there any information you need before starting the test?`,
        `${hello} is the team still planning to test ${ours}${inApp}, ${later}`,
        `${hello} I'll pause the follow-up on testing ${ours}${inApp} for now. If the team is ready to try it later, you're welcome to message me.`,
      ][step - 1] };
    case 'nudge_test':
      return { subject: `Your ${BRAND} sample`, body: [
        `${hello} following up on the ${ours} test${inApp}. How did it go?`,
        `${hello} was the ${ours} a good fit for ${app || '[recipe tested]'} overall? If anything wasn't quite right, I'd be glad to understand it.`,
        `${hello} would you be able to share a brief update on the ${ours} test${inApp}, ${later}`,
        `${hello} I'll pause the follow-up on the ${ours} test${inApp} for now. If the team has any feedback later, I'd be glad to hear it.`,
      ][step - 1] };
    case 'confirm_receipt':
      return { subject: `Your ${BRAND} sample`, body: `${hello} has the ${ours} sample sent on [date sent] arrived safely?` };
    case 'test_plan':
      return { subject: `Your ${BRAND} sample`, body: `${hello} which recipe would the team like to try first with the ${ours} sample you received?` };
    case 'test_result':
      return { subject: `Your ${BRAND} sample`, body: `${hello} how did the ${ours} perform in ${app || '[recipe tested]'}? If there's anything from the test you'd like me to look into, please let me know.` };
    case 'paid_trial':
      return {
        subject: `${BRAND} paid trial`,
        body: `${hello} for further testing after the initial ${ours} sample, I'd suggest a paid trial: [pack size] at [price and terms]. Would you like me to prepare that trial order?`,
      };
    case 'first_order_quote':
      return {
        subject: `${BRAND} first order`,
        body: `${hello} glad the ${ours} worked for ${app || '[recipe tested]'}. Would you like me to prepare a first-order quote for your next production batch?`,
      };
    case 'check_in':
      return {
        subject: `${BRAND} order`,
        body: `${hello} Pat from ${BRAND} here. Are you planning another ${ours} order? If so, I can check the pack options and ordering details for you.`,
      };
    default:
      // Condensed milk: no free sample; ask how they would use it first.
      if (milk) {
        return { subject: intro, body: trade
          ? `${hello} I'm Pat from ${BRAND} (${HOME_LINK}). I saw that you carry ${app || '[a product they carry]'} and wanted to introduce our ${product} for your team to consider. Which customer group would you have in mind for it?`
          : `${hello} I'm Pat from ${BRAND} (${HOME_LINK}). I saw ${app || '[menu item]'} on your menu and thought our ${product} may be worth assessing. How would your team want to use it in that recipe?` };
      }
      return { subject: intro, body: (trade
        ? `${hello} Pat from ${BRAND} here. I saw you carry ${app || '[a product they carry]'}. Would a free 2 × 500g sample of our ${product} be useful to assess for your range?`
        : `${hello} Pat from ${BRAND} here. I saw ${app || '[menu item]'} on your menu. Would a free 2 × 500g sample of our ${product} be useful to test with it?`)
        + `\n\n${PROOF.english}\n${WHOLESALE_LINK}` };
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
