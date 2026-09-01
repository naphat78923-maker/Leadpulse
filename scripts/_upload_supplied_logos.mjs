// Upload the approved supplied logos to Supabase (same path as the app's manual upload).
// Reads scripts/_supplied_match.json (matched[] only). Resizes each to 256x256 webp via sharp.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = process.cwd();
const SUP = path.join(root, 'scripts/_logos_supplied');
const src = fs.readFileSync(path.join(root, 'src/lib/supabase.ts'), 'utf8');
const supabase = createClient(
  src.match(/supabaseUrl\s*=\s*'([^']+)'/)[1],
  src.match(/supabaseAnonKey\s*=\s*'([^']+)'/)[1],
  { auth: { persistSession: false } }
);
const COMPANY_LOGO_BUCKET = 'company-logos';
const DIM = 256;

async function uploadCompanyLogo(companyId, webpBuf) {
  const p = `logos/${companyId}.webp`;
  const { error } = await supabase.storage.from(COMPANY_LOGO_BUCKET)
    .upload(p, webpBuf, { upsert: true, contentType: 'image/webp', cacheControl: '3600' });
  if (error) throw error;
  return supabase.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(p).data.publicUrl;
}
async function updateCompany(id, updates) {
  const { error } = await supabase.from('companies').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

async function main() {
  const { matched } = JSON.parse(fs.readFileSync(path.join(root, 'scripts/_supplied_match.json'), 'utf8'));
  console.log(`Uploading ${matched.length} logos...`);
  let ok = 0, fail = 0;
  for (const m of matched) {
    try {
      const buf = fs.readFileSync(path.join(SUP, m.file));
      const webp = await sharp(buf).resize(DIM, DIM, { fit: 'cover', position: 'centre' }).webp({ quality: 85 }).toBuffer();
      const url = await uploadCompanyLogo(m.id, webp);
      await updateCompany(m.id, { logo_url: url });
      console.log(`OK   ${m.name}`);
      ok++;
    } catch (e) {
      console.log(`FAIL ${m.name}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nDONE ok=${ok} fail=${fail}`);
}
main().catch((e) => console.log('FATAL', e.message));
