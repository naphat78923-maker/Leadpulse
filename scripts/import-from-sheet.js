/**
 * Import leads from Google Sheet to LeadPulse
 * 
 * Usage: node scripts/import-from-sheet.js [sheet-id]
 * 
 * Uses the existing Google Sheets API via the Hermes workspace script.
 * Reads the CRM tab, maps columns to LeadPulse format, and outputs JSON.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SHEET_ID = process.argv[2] || '1ZfOmrhwVizV3Uvn1jBkBQvLv-pgQfAUSzs-BOfAhXFE';
const GAPI_SCRIPT = '/Users/pat/.hermes/skills/productivity/google-workspace/scripts/google_api.py';
const OAUTH_CHECK = '/Users/pat/.hermes/profiles/jarvis/skills/productivity/google-sheets-access/scripts/sheets_oauth.py';

function checkOAuth() {
  try {
    const result = execSync(`python ${OAUTH_CHECK} --check`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.includes('valid') || result.includes('✓');
  } catch {
    return false;
  }
}

function readSheet() {
  console.log(`Reading sheet ${SHEET_ID}, tab "CRM"...`);
  const result = execSync(
    `python ${GAPI_SCRIPT} sheets get ${SHEET_ID} "CRM!A1:Z100"`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );
  return result;
}

function parseRows(jsonStr) {
  const rows = JSON.parse(jsonStr);
  // rows[0] = header "VG Saveur Butter Leads CRM"
  // rows[1] = "Group by..."
  // rows[2] = column headers
  // rows[3...] = data
  
  const headers = rows[2];
  console.log(`Found ${rows.length - 3} data rows`);
  console.log(`Columns: ${headers.filter((h, i) => i < 10).join(', ')}...`);
  
  const leads = [];
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    
    const lead = mapRowToLead(row, headers);
    if (lead.client_name) {
      leads.push(lead);
    }
  }
  return leads;
}

function mapRowToLead(values, headers) {
  const get = (name) => {
    const idx = headers.indexOf(name);
    return idx >= 0 && idx < values.length ? values[idx] : null;
  };
  
  // Map stage text to our enum
  const stageText = get('Potential Status') || '';
  const stageMap = {
    'Research first': 'research_first',
    'Contacted': 'contacted',
    'Needs to send details': 'needs_to_send_details',
    'Testing / waiting feedback': 'testing_waiting_feedback',
    'Success': 'success',
    'Not interested': 'not_interested',
    'Revisit': 'revisit',
    'Sample sending': 'sample_sending',
  };
  const stage = stageMap[stageText] || 'research_first';
  
  // Product interest
  const productText = (get('Product Interest') || 'butter').toLowerCase();
  const product_interest = productText.includes('both') ? 'both' : 
                          productText.includes('condensed') ? 'condensed_milk' : 'butter';
  
  const priority = (get('Priority') || 'medium').toLowerCase();
  const deal_potential = (get('Deal Potential') || 'medium').toLowerCase();
  const customer_size = (get('Customer Size') || 'B').toUpperCase();
  
  const nudgeCount = parseInt(get('Nudge Count') || '0', 10) || 0;
  const daysSinceContact = get('Days Since Contact');
  
  // Parse contact field (may contain email; phone; LINE)
  const contactRaw = get('Contact') || '';
  
  return {
    stage,
    client_name: get('Client Name') || '',
    type: get('Type') || '',
    priority: ['high', 'medium', 'low'].includes(priority) ? priority : 'medium',
    next_action: get('Next Action') || null,
    next_followup_date: parseDate(get('Next Follow-up Date')),
    latest_contact_date: parseDate(get('Latest Contact Date')),
    lead_stage: get('Lead Stage') || '',
    product_interest,
    contact_person: get('Contact Person') || null,
    role: get('Role') || null,
    contact_email: extractEmail(contactRaw),
    contact_phone: extractPhone(contactRaw),
    contact_line: extractLine(contactRaw),
    decision_maker: parseDecisionMaker(get('Decision Maker?')),
    last_outcome: get('Last Outcome') || null,
    deal_potential: ['high', 'medium', 'low'].includes(deal_potential) ? deal_potential : 'medium',
    lead_score: get('Lead Score') || null,
    customer_size: ['A', 'B', 'C'].includes(customer_size) ? customer_size : 'B',
    notes: get('Last Update / Notes') || null,
    contact_source: get('Contact Source') || null,
    captured_by: get('Captured By') || null,
    sample_delivery_address: get('Sample Delivery Address') || null,
    owner: get('Owner') || null,
    last_nudge_date: parseDate(get('Last Nudge Date')),
    nudge_count: nudgeCount,
    last_nudge_type: get('Last Nudge Type')?.replace(/\s+/g, '_').toLowerCase() || null,
    days_since_contact: daysSinceContact ? parseInt(daysSinceContact, 10) : null,
  };
}

function parseDate(s) {
  if (!s || s === '#ERROR!' || s.trim() === '') return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

function extractEmail(contactStr) {
  if (!contactStr) return null;
  const match = contactStr.match(/[\w.-]+@[\w.-]+\.\w+/);
  return match ? match[0] : null;
}

function extractPhone(contactStr) {
  if (!contactStr) return null;
  const parts = contactStr.split(/[;\n]/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (/\d/.test(trimmed) && !trimmed.includes('@') && !trimmed.toLowerCase().includes('line')) {
      return trimmed;
    }
  }
  return null;
}

function extractLine(contactStr) {
  if (!contactStr) return null;
  const match = contactStr.match(/LINE\s*@?\s*(\S+)/i);
  return match ? `@${match[1]}` : null;
}

function parseDecisionMaker(val) {
  if (!val) return null;
  const v = val.toLowerCase();
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return null;
}

function main() {
  console.log('=== LeadPulse Sheet Import ===\n');
  
  if (!checkOAuth()) {
    console.error('✗ OAuth not configured. Run: python scripts/sheets_oauth.py --auth-url');
    process.exit(1);
  }
  console.log('✓ OAuth token valid');
  
  try {
    const json = readSheet();
    const leads = parseRows(json);
    
    const output = {
      imported_at: new Date().toISOString(),
      sheet_id: SHEET_ID,
      total_leads: leads.length,
      stages: {},
      leads,
    };
    
    // Count by stage
    leads.forEach(l => {
      output.stages[l.stage] = (output.stages[l.stage] || 0) + 1;
    });
    
    const outPath = path.join(__dirname, '..', 'src', 'data', 'imported-leads.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    
    console.log(`\n✓ Imported ${leads.length} leads`);
    console.log('Stages:', output.stages);
    console.log(`\nOutput: ${outPath}`);
    
  } catch (err) {
    console.error('✗ Import failed:', err.message);
    process.exit(1);
  }
}

main();
