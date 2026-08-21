#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LeadPulse — account_events import (REVIEW / DRY-RUN by default)
==============================================================

Purpose
-------
Pipe VG Saveur sales exports into a new `account_events` table so the
Account Health Score (Slice 5) can compute the Monetary (M) component.

SAFETY
------
* DEFAULT MODE IS DRY-RUN. Nothing is written to Supabase.
* Pass `--apply` ONLY after you have:
    1. reviewed the preview output below,
    2. run the DDL (printed at the bottom of a dry run) in the
       Supabase dashboard SQL editor, and
    3. confirmed the company name mappings in NAME_MAP.
* The script reads the anon key from src/lib/supabase.ts (never printed).

Why the sales-summary-*.csv files are EXCLUDED
---------------------------------------------
Those files are daily VG Saveur TOTALS (Gross/Refunds/Net/Margin) with no
company dimension — they cannot be attributed to a specific CRM account, so
they are skipped. Only per-company exports (SAL_EXC) become account_events.
If you later want them as a business-level rollup, set AGGREGATE_AS_SELF
(and create a "VG Saveur (self)" company) — left OFF on purpose.

Usage
-----
    python3 scripts/import-account-events.py            # dry run + preview
    python3 scripts/import-account-events.py --apply    # actually insert
"""

import csv
import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime

# --------------------------------------------------------------------------
# CONFIG  (edit for review)
# --------------------------------------------------------------------------
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUPABASE_TS = os.path.join(REPO, "src/lib/supabase.ts")

# Source exports to import (per-company only)
SOURCES = [
    os.path.expanduser("~/Downloads/20251106_202736_SAL_EXC.csv"),
]

# Manual override map: CSV company name (normalized) -> LeadPulse company name.
# Fill these in after reviewing the UNMATCHED list, then re-run.
NAME_MAP = {
    # "บริษัท เดอะมอลล์ กรุ๊ป จำกัด": "The Mall Group",
}

# Product line cannot be inferred per-row from SAL_EXC (department only).
# Leave None to review; set a default if you are sure (e.g. "Butter").
DEFAULT_PRODUCT_LINE = None

# business-level aggregate files are excluded unless you opt in
AGGREGATE_AS_SELF = False

DRY_RUN = "--apply" not in sys.argv
BATCH = 100

# --------------------------------------------------------------------------
# DDL (for review — run in Supabase dashboard SQL editor, then DISABLE RLS)
# --------------------------------------------------------------------------
DDL = """
-- account_events: piped sales/order history per company (Monetary source)
CREATE TABLE IF NOT EXISTS public.account_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    event_date    date        NOT NULL,
    amount        numeric(12,2) NOT NULL DEFAULT 0,   -- net (excl. VAT)
    amount_inc_vat numeric(12,2),
    product_line  text,
    source        text        NOT NULL,               -- export filename
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_events_company ON public.account_events(company_id);
CREATE INDEX IF NOT EXISTS idx_account_events_date    ON public.account_events(event_date);

-- LeadPulse convention: new tables need RLS OFF (app reads via anon key).
ALTER TABLE public.account_events DISABLE ROW LEVEL SECURITY;
"""

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def load_supabase():
    txt = open(SUPABASE_TS, encoding="utf-8").read()
    m_url = re.search(r"['\"](https://[a-z0-9]+\.supabase\.co)['\"]", txt)
    m_key = re.search(r"['\"](eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)['\"]", txt)
    if not m_url or not m_key:
        raise SystemExit("[fatal] could not read Supabase URL/key from src/lib/supabase.ts")
    return m_url.group(1), m_key.group(1)

def normalize(name):
    """Strip Thai legal prefixes / whitespace for fuzzy matching."""
    s = name or ""
    s = s.replace("=", "").replace('"', "")
    s = re.sub(r"บริษัท|จำกัด|ห้าง|เชิงพาณิชย์|มหาชน|สาขา.*$", "", s)
    s = re.sub(r"[^a-zA-Z0-9ก-๙\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip().lower()

def clean(cell):
    return (cell or "").strip().strip("=").strip('"').strip()

def get_companies(url, key):
    req = urllib.request.Request(
        f"{url}/rest/v1/companies?select=id,name&deleted_at=is.null",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        rows = json.loads(r.read().decode())
    index = {normalize(c["name"]): c["id"] for c in rows}
    return rows, index

def parse_sal_exc(path):
    """Return list of candidate events from a SAL_EXC-style export."""
    events = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = [clean(h) for h in next(reader)]
        # expected columns (0-indexed)
        i_name = 1   # Company name
        i_date = 8   # Sale date  (dd/mm/yyyy)
        i_inc  = 10  # Sale amt.(Inc.VAT)
        i_exc  = 11  # Sale amt.(Exc.VAT)
        for row in reader:
            if len(row) <= i_exc:
                continue
            name = clean(row[i_name])
            if not name:
                continue
            raw_date = clean(row[i_date])
            try:
                d = datetime.strptime(raw_date, "%d/%m/%Y").date().isoformat()
            except ValueError:
                continue
            try:
                inc = float(clean(row[i_inc]).replace(",", ""))
                exc = float(clean(row[i_exc]).replace(",", ""))
            except ValueError:
                inc = exc = 0.0
            events.append({
                "company_name_raw": name,
                "company_name_norm": normalize(name),
                "event_date": d,
                "amount": round(exc, 2),
                "amount_inc_vat": round(inc, 2),
                "product_line": DEFAULT_PRODUCT_LINE,
                "source": os.path.basename(path),
            })
    return events

def match_events(events, company_index):
    matched, unmatched = [], []
    for e in events:
        n = e["company_name_norm"]
        cid = company_index.get(n) or company_index.get(normalize(NAME_MAP.get(e["company_name_raw"], "")))
        if cid:
            e["company_id"] = cid
            matched.append(e)
        else:
            e["company_id"] = None
            unmatched.append(e)
    return matched, unmatched

def apply(matched, url, key):
    rows = [{
        "company_id": e["company_id"],
        "event_date": e["event_date"],
        "amount": e["amount"],
        "amount_inc_vat": e["amount_inc_vat"],
        "product_line": e["product_line"],
        "source": e["source"],
    } for e in matched]
    inserted = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        req = urllib.request.Request(
            f"{url}/rest/v1/account_events",
            data=json.dumps(chunk).encode(),
            headers={"apikey": key, "Authorization": f"Bearer {key}",
                     "Content-Type": "application/json", "Prefer": "return=minimal"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            inserted += len(chunk)
    return inserted

# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main():
    url, key = load_supabase()
    companies, cidx = get_companies(url, key)

    all_events = []
    for src in SOURCES:
        if not os.path.exists(src):
            print(f"[skip] source not found: {src}")
            continue
        evs = parse_sal_exc(src)
        print(f"[parse] {os.path.basename(src)}: {len(evs)} rows")
        all_events.extend(evs)

    matched, unmatched = match_events(all_events, cidx)

    print("\n================ DRY-RUN PREVIEW ================" if DRY_RUN
          else "\n================ APPLY MODE ================")
    print(f"Total candidate events : {len(all_events)}")
    print(f"Matched to CRM company : {len(matched)}")
    print(f"UNMATCHED (skipped)    : {len(unmatched)}")

    print("\n--- MATCHED (would be inserted) ---")
    for e in matched:
        print(f"  {e['event_date']}  {e['company_name_raw'][:40]:40}  "
              f"excl=฿{e['amount']:,.0f}  inc=฿{e['amount_inc_vat']:,.0f}  "
              f"company_id={e['company_id']}")

    print("\n--- UNMATCHED (review NAME_MAP, then re-run) ---")
    seen = set()
    for e in unmatched:
        if e["company_name_norm"] in seen:
            continue
        seen.add(e["company_name_norm"])
        print(f"  {e['company_name_raw']}   (norm: {e['company_name_norm']})")

    if unmatched:
        print("\nNOTE: unmatched rows are NOT imported. Add them to NAME_MAP")
        print("      (CSV name -> exact LeadPulse company name) and re-run.")

    print("\n================ TABLE DDL (review) ================")
    print(DDL)

    if DRY_RUN:
        print("DRY RUN complete — no data was written. Re-run with --apply to insert.")
        return

    # APPLY
    if unmatched:
        print(f"\nRefusing to apply: {len(unmatched)} unmatched rows. "
              f"Resolve NAME_MAP first (or they will be skipped).")
        # Optional: insert only matched
        confirm = input("Insert ONLY the matched rows? (type 'yes'): ").strip()
        if confirm != "yes":
            print("Aborted. Nothing written.")
            return
    n = apply(matched, url, key)
    print(f"\nInserted {n} account_events rows.")

if __name__ == "__main__":
    main()
