// Match supplied logo files (named by company) to CRM companies.
// Prints a proposed mapping + a conflicts/ambiguous list. Does NOT upload.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const SUP = path.join(root, 'scripts/_logos_supplied');
const src = fs.readFileSync(path.join(root, 'src/lib/supabase.ts'), 'utf8');
const supabase = createClient(
  src.match(/supabaseUrl\s*=\s*'([^']+)'/)[1],
  src.match(/supabaseAnonKey\s*=\s*'([^']+)'/)[1],
  { auth: { persistSession: false } }
);

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

// Manual aliases for files whose names lost apostrophes/spaces vs CRM.
const ALIASES = {
  'aprils bakery': 'April\'s Bakery',
  'artofbaking': 'Art of Baking Co., Ltd. (AOB)',
  'kyorollen': 'Kyo Roll En',
  'lacabra': 'La Cabra Bangkok',
  'logo-anantara': 'Anantara Siam Bangkok Hotel',
  'broccolirevolution': 'Broccoli Revolution',
  'coffeebeans': 'Coffee Beans by Dao',
  'cpaxtra': 'CP Axtra Public Co., Ltd.',
  'crustpatisserie': 'Crust Patisserie',
  'dusitthani': 'Dusit Thani Bangkok',
  'earthhouse': 'Earth House Bangkok',
  'fourseasons': 'Four Seasons Hotel Bangkok at Chao Phraya River',
  'gateauxhouse': 'Gateaux House',
  'happygrocers': 'Happy Grocers',
  'millionfoods': 'Million Foods',
  'ninepastry': 'Nine Pastry',
  'stregis': 'St. Regis Bangkok',
  'topstongtin': 'Central Tops TOngtin',
  'earthhouse': 'Earthling Cafe',
};

async function main() {
  const { data: companies, error } = await supabase
    .from('companies').select('id, name').is('deleted_at', null);
  if (error) { console.log('ERR', error.message); process.exit(1); }
  const byNorm = new Map();
  for (const c of companies) {
    const k = norm(c.name);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(c);
  }

  const files = fs.readdirSync(SUP).filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f));
  console.log(`Supplied files: ${files.length}\n`);
  const matched = [], ambiguous = [], unmatched = [];
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const f of files) {
    const base = f.replace(/\.[^.]+$/, '');
    // Direct UUID-named file → exact company id match
    if (UUID_RE.test(base)) {
      const c = companies.find((x) => x.id === base);
      if (c) { matched.push({ file: f, id: c.id, name: c.name }); continue; }
      unmatched.push(f); continue;
    }
    // Manual alias (files whose names lost apostrophes/spaces)
    const lookup = ALIASES[base.toLowerCase()] || base;
    const key = norm(lookup);
    if (byNorm.has(key) && byNorm.get(key).length === 1) {
      const c = byNorm.get(key)[0];
      matched.push({ file: f, id: c.id, name: c.name });
    } else if (byNorm.has(key) && byNorm.get(key).length > 1) {
      ambiguous.push({ file: f, candidates: byNorm.get(key).map((c) => c.name) });
    } else {
      // try substring match as fallback
      const sub = [...byNorm.entries()].find(([k]) => k.includes(key) || key.includes(k));
      if (sub) matched.push({ file: f, id: sub[1][0].id, name: sub[1][0].name, fuzzy: true });
      else unmatched.push(f);
    }
  }

  console.log(`=== MATCHED (${matched.length}) ===`);
  for (const m of matched) console.log(`  ${m.file}  ->  ${m.name}${m.fuzzy ? '  [substring]' : ''}  (${m.id})`);
  if (ambiguous.length) {
    console.log(`\n=== AMBIGUOUS (${ambiguous.length}) — tell me which ===`);
    for (const a of ambiguous) console.log(`  ${a.file}  ->  ${a.candidates.join(' | ')}`);
  }
  if (unmatched.length) {
    console.log(`\n=== UNMATCHED (${unmatched.length}) — no company found ===`);
    for (const u of unmatched) console.log(`  ${u}`);
  }
  console.log(`\nSummary: matched=${matched.length} ambiguous=${ambiguous.length} unmatched=${unmatched.length}`);
  fs.writeFileSync(path.join(root, 'scripts/_supplied_match.json'),
    JSON.stringify({ matched, ambiguous, unmatched }, null, 2));
}
main().catch((e) => console.log('FATAL', e.message));
