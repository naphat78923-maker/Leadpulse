/**
 * LeadPulse CRM — Import existing leads into Supabase
 * 
 * Reads the imported-leads.json (your 75 Google Sheet leads),
 * maps them into the 4-database CRM structure, and inserts into Supabase.
 * 
 * Usage: node scripts/import-to-supabase.js
 * 
 * Prerequisites:
 * 1. Run scripts/setup-supabase.sql in Supabase SQL Editor
 * 2. Ensure Supabase credentials in src/lib/supabase.ts are correct
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase credentials (must match src/lib/supabase.ts)
const supabaseUrl = 'https://mkyhikarlxuwvprjabbi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1reWhpa2FybHh1d3ZwcmphYmJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNjk5MjgsImV4cCI6MjEwMjY0NTkyOH0.9FB3HhMl_O-tYmFV1non4iIcKhd_c0_XoFQxzYu4YZg';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function id() { return Math.random().toString(36).substring(2, 11); }
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().split('T')[0]; }

async function main() {
  console.log('=== LeadPulse Supabase Import ===\n');

  // Load existing leads
  const leadsPath = path.join(__dirname, '..', 'src', 'data', 'imported-leads.json');
  if (!fs.existsSync(leadsPath)) {
    console.error('✗ imported-leads.json not found. Run: node scripts/import-from-sheet.js');
    process.exit(1);
  }

  const leadsData = JSON.parse(fs.readFileSync(leadsPath, 'utf-8'));
  const leads = leadsData.leads;
  console.log(`Loaded ${leads.length} leads from imported-leads.json`);

  // ─── Step 1: Extract and insert companies ───
  console.log('\n── Companies ──');
  const companyMap = new Map(); // client_name -> company_id
  const companyInserts = [];
  const seenCompanies = new Set();

  for (const lead of leads) {
    const name = lead.client_name;
    if (seenCompanies.has(name)) continue;
    seenCompanies.add(name);

    const stage = lead.stage;
    const status = stage === 'success' ? 'active_customer' :
                   stage === 'not_interested' ? 'lost' :
                   stage === 'contacted' ? 'prospect' : 'prospect';

    const owner = lead.owner || 'Pat';
    const tags = [];
    if (lead.type) {
      const t = lead.type.toLowerCase();
      if (t.includes('bakery')) tags.push('bakery');
      if (t.includes('hotel')) tags.push('hotel');
      if (t.includes('restaurant')) tags.push('restaurant');
      if (t.includes('cafe')) tags.push('cafe');
      if (t.includes('manufacturer')) tags.push('manufacturer');
      if (t.includes('chain')) tags.push('chain');
      if (t.includes('export')) tags.push('export');
    }

    companyInserts.push({
      name,
      status,
      lead_source: lead.contact_source || null,
      account_owner: owner,
      last_contact_date: lead.latest_contact_date,
      tags,
      industry: lead.type || null,
      size: lead.customer_size,
      address: lead.sample_delivery_address,
      website: null,
      notes: lead.notes,
    });
  }

  console.log(`Inserting ${companyInserts.length} companies...`);
  const { data: insertedCompanies, error: companiesError } = await supabase
    .from('companies')
    .insert(companyInserts)
    .select();

  if (companiesError) {
    console.error('✗ Companies insert failed:', companiesError.message);
    process.exit(1);
  }

  insertedCompanies.forEach(c => companyMap.set(c.name, c.id));
  console.log(`✓ Inserted ${insertedCompanies.length} companies`);

  // ─── Step 2: Extract and insert contacts ───
  console.log('\n── Contacts ──');
  const contactInserts = [];
  const seenContacts = new Set();

  for (const lead of leads) {
    if (!lead.contact_person) continue;
    const key = `${lead.contact_person}-${lead.client_name}`;
    if (seenContacts.has(key)) continue;
    seenContacts.add(key);

    const stage = lead.stage;
    const status = stage === 'success' ? 'active' :
                   stage === 'not_interested' ? 'not_interested' :
                   stage === 'contacted' ? 'replied' : 'active';

    contactInserts.push({
      name: lead.contact_person,
      email: lead.contact_email,
      phone: lead.contact_phone,
      line: lead.contact_line,
      job_title: lead.role,
      company_id: companyMap.get(lead.client_name) || null,
      status,
      last_contacted_date: lead.latest_contact_date,
      notes: lead.notes,
    });
  }

  console.log(`Inserting ${contactInserts.length} contacts...`);
  const { data: insertedContacts, error: contactsError } = await supabase
    .from('contacts')
    .insert(contactInserts)
    .select();

  if (contactsError) {
    console.error('✗ Contacts insert failed:', contactsError.message);
    process.exit(1);
  }

  console.log(`✓ Inserted ${insertedContacts.length} contacts`);

  // ─── Step 3: Extract and insert deals ───
  console.log('\n── Deals ──');
  const stageMap = {
    'research_first': 'research',
    'contacted': 'contacted',
    'needs_to_send_details': 'proposal',
    'testing_waiting_feedback': 'negotiation',
    'success': 'closed_won',
    'not_interested': 'closed_lost',
    'revisit': 'research',
    'sample_sending': 'proposal',
  };

  const dealInserts = leads.map(lead => ({
    title: `${lead.client_name} — ${lead.product_interest === 'both' ? 'Butter + Condensed Milk' : lead.product_interest === 'condensed_milk' ? 'Condensed Milk' : 'Butter'}`,
    stage: stageMap[lead.stage] || 'research',
    product: lead.product_interest === 'both' ? 'Both' : lead.product_interest === 'condensed_milk' ? 'Condensed Milk' : 'Butter',
    client: lead.client_name,
    company_id: companyMap.get(lead.client_name) || null,
    contact_ids: [],
    value: null,
    priority: lead.priority || 'medium',
    next_action: lead.next_action,
    followup_date: lead.next_followup_date,
    last_outcome: lead.last_outcome,
    nudge_count: lead.nudge_count || 0,
  }));

  console.log(`Inserting ${dealInserts.length} deals...`);
  const { data: insertedDeals, error: dealsError } = await supabase
    .from('deals')
    .insert(dealInserts)
    .select();

  if (dealsError) {
    console.error('✗ Deals insert failed:', dealsError.message);
    process.exit(1);
  }

  console.log(`✓ Inserted ${insertedDeals.length} deals`);

  // ─── Step 4: Extract and insert meetings ───
  console.log('\n── Meetings ──');
  const meetingInserts = [];
  const seenMeetings = new Set();

  for (const lead of leads) {
    if (!lead.latest_contact_date) continue;
    const key = `${lead.client_name}-${lead.latest_contact_date}`;
    if (seenMeetings.has(key)) continue;
    seenMeetings.add(key);

    const stage = lead.stage;
    const type = lead.nudge_count > 0 ? 'nudge' : 'email';
    const outcome = stage === 'success' ? 'positive' :
                    stage === 'not_interested' ? 'negative' :
                    stage === 'contacted' ? 'no_response' : null;

    meetingInserts.push({
      description: `${type === 'nudge' ? 'Nudge sent' : 'Initial outreach'} — ${lead.product_interest === 'both' ? 'Butter + Condensed Milk' : lead.product_interest === 'condensed_milk' ? 'Condensed Milk' : 'Butter'}`,
      type,
      date: lead.latest_contact_date,
      company_id: companyMap.get(lead.client_name) || null,
      contact_ids: [],
      deal_id: null,
      product: lead.product_interest === 'both' ? 'Both' : lead.product_interest === 'condensed_milk' ? 'Condensed Milk' : 'Butter',
      summary: lead.last_outcome,
      outcome,
      followup_date: lead.next_followup_date,
    });
  }

  console.log(`Inserting ${meetingInserts.length} meetings...`);
  const { data: insertedMeetings, error: meetingsError } = await supabase
    .from('meetings')
    .insert(meetingInserts)
    .select();

  if (meetingsError) {
    console.error('✗ Meetings insert failed:', meetingsError.message);
    process.exit(1);
  }

  console.log(`✓ Inserted ${insertedMeetings.length} meetings`);

  // ─── Summary ───
  console.log('\n=== Import Complete ===');
  console.log(`Companies: ${insertedCompanies.length}`);
  console.log(`Contacts:  ${insertedContacts.length}`);
  console.log(`Deals:     ${insertedDeals.length}`);
  console.log(`Meetings:  ${insertedMeetings.length}`);
  console.log('\nRefresh LeadPulse at http://localhost:3000 to see live data.');
}

main().catch(err => {
  console.error('✗ Import failed:', err.message);
  process.exit(1);
});
