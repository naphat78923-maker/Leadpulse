/**
 * Test all Supabase CRUD operations
 * Usage: node scripts/test-supabase.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mkyhikarlxuwvprjabbi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1reWhpa2FybHh1d3ZwcmphYmJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNjk5MjgsImV4cCI6MjEwMjY0NTkyOH0.9FB3HhMl_O-tYmFV1non4iIcKhd_c0_XoFQxzYu4YZg';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('=== LeadPulse Supabase Test ===\n');

  // Test 1: Create company
  console.log('1. Creating test company...');
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({ name: 'Test Bakery ' + Date.now(), status: 'prospect', lead_source: 'test', account_owner: 'test', tags: ['test'] })
    .select()
    .single();
  if (companyError) console.error('   ✗ Company create failed:', companyError.message);
  else console.log('   ✓ Company created:', company.name, '(id:', company.id.substring(0, 8) + '...)');

  // Test 2: Create contact
  console.log('2. Creating test contact...');
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .insert({ name: 'Test Contact ' + Date.now(), email: 'test@example.com', status: 'active', company_id: company?.id || null })
    .select()
    .single();
  if (contactError) console.error('   ✗ Contact create failed:', contactError.message);
  else console.log('   ✓ Contact created:', contact.name, '(id:', contact.id.substring(0, 8) + '...)');

  // Test 3: Create deal
  console.log('3. Creating test deal...');
  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .insert({ title: 'Test Deal ' + Date.now(), stage: 'research', product: 'Butter', client: 'Test Client', company_id: company?.id || null, contact_ids: contact?.id ? [contact.id] : [] })
    .select()
    .single();
  if (dealError) console.error('   ✗ Deal create failed:', dealError.message);
  else console.log('   ✓ Deal created:', deal.title, '(id:', deal.id.substring(0, 8) + '...)');

  // Test 4: Create meeting
  console.log('4. Creating test meeting...');
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .insert({ description: 'Test Meeting ' + Date.now(), type: 'call', date: new Date().toISOString().split('T')[0], company_id: company?.id || null, deal_id: deal?.id || null })
    .select()
    .single();
  if (meetingError) console.error('   ✗ Meeting create failed:', meetingError.message);
  else console.log('   ✓ Meeting created:', meeting.description, '(id:', meeting.id.substring(0, 8) + '...)');

  // Test 5: Read all
  console.log('5. Reading all data...');
  const [companies, contacts, deals, meetings] = await Promise.all([
    supabase.from('companies').select('count', { count: 'exact', head: true }),
    supabase.from('contacts').select('count', { count: 'exact', head: true }),
    supabase.from('deals').select('count', { count: 'exact', head: true }),
    supabase.from('meetings').select('count', { count: 'exact', head: true }),
  ]);
  console.log(`   Companies: ${companies.count}, Contacts: ${contacts.count}, Deals: ${deals.count}, Meetings: ${meetings.count}`);

  // Cleanup test data
  console.log('6. Cleaning up test data...');
  if (meeting) await supabase.from('meetings').delete().eq('id', meeting.id);
  if (deal) await supabase.from('deals').delete().eq('id', deal.id);
  if (contact) await supabase.from('contacts').delete().eq('id', contact.id);
  if (company) await supabase.from('companies').delete().eq('id', company.id);
  console.log('   ✓ Test data cleaned up');

  console.log('\n=== All Tests Passed ===');
}

test().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
