#!/usr/bin/env node
/**
 * One-off import of the legacy "Operations & Comms Sheet" missing-parcels
 * tab(s) into the new `parcel_claims` Supabase table.
 *
 * Usage:
 *   node scripts/import-parcel-claims.js path/to/export.csv [--dry] [--since=YYYY-MM-DD]
 *
 * How to get the CSV:
 *   In Excel/SharePoint, open the sheet, select the "Missing Parcels" tab
 *   (and repeat per tab if there are several, e.g. old month tabs), then
 *   File > Save As > CSV (or Data > From Table/Range export). Run this
 *   script once per tab you want imported — it always appends, never
 *   deletes, so it's safe to run it several times for different exports.
 *
 * --dry prints the first 10 parsed rows and a summary count, but does not
 * write anything to Supabase — use this first to sanity-check column
 * mapping and date parsing before the real import.
 *
 * --since=YYYY-MM-DD only imports rows with Date Started on or after that
 * date — use this for a top-up run against a fresh export of the *whole*
 * sheet (rather than a full re-import, which has no de-dup and would
 * duplicate everything already imported). Pick the date as the day *after*
 * whatever the table's current latest date_started is — check with:
 *   select max(date_started) from parcel_claims;
 *
 * KNOWN LIMITATION: Excel cell background colour (the sheet's colour-coded
 * status key) is not exported to CSV, so `stage`/`issue_type` cannot be
 * inferred here and are left at their defaults ('investigating' / null) for
 * every imported row. The team should re-triage stage for older rows over
 * time using the new dropdown in the app — status/denial info still comes
 * across fine via the Denial/Settled column below.
 *
 * KNOWN LIMITATION: a real export of this sheet has a "colour key" legend
 * block sitting above the actual data table (own example: 7 rows before the
 * real "DATE STARTED,Month,..." header) — this script finds the real header
 * row by content, so that's handled automatically, no need to trim the file
 * by hand first.
 *
 * KNOWN LIMITATION: the Retail column has years of stray non-price values
 * typed into it (phone numbers, postcodes — confirmed against a real export,
 * ~6% of rows) since it's free-typed rather than validated. retail isn't
 * shown anywhere in the app any more (removed 2026-08-31), so this is
 * harmless — it just sits unused in the DB column for those rows.
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// --- tiny .env.local loader (no dotenv dependency) ---
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
loadEnvLocal()

const BATCH_SIZE = 500

// --- CSV parsing (handles quoted fields with commas/newlines) ---
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1]
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && next === '\n') i++
        row.push(field); field = ''
        if (row.some(v => v !== '')) rows.push(row)
        row = []
      } else field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

function findCol(headers, ...candidates) {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const cand of candidates) {
    const idx = lower.findIndex(h => h.includes(cand))
    if (idx >= 0) return idx
  }
  return -1
}

function parseNumber(v) {
  if (!v) return null
  const n = parseFloat(String(v).replace(/[£,\s]/g, ''))
  return isNaN(n) ? null : n
}

// Sheet dates observed as M/D/YYYY in the export — adjust here if a real
// export turns out to use D/M/YYYY instead (check with --dry first).
// The sheet is NOT consistently one format — different rows use M/D/YYYY and
// D/M/YYYY depending on who typed them and when (confirmed against a real
// export: e.g. "22/1/2026" only makes sense as 22 Jan, there's no month 22).
// Where the first-position reading gives an impossible month (>12), swap —
// that's unambiguous. Where BOTH positions are ≤12 it's genuinely ambiguous
// and this keeps the M/D/YYYY reading, same as before — no way to resolve
// that automatically in general, but see --since's caller-supplied
// disambiguation for a known batch/date-range if you hit this for real.
function parseDate(v) {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s // already ISO
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  let [, a, b, y] = m
  if (y.length === 2) y = `20${y}`
  if (y.length !== 4) return null // typo'd year (e.g. "240", "3033") — reject rather than guess
  let month = parseInt(a, 10), day = parseInt(b, 10)
  if (month > 12 && day <= 12) { [month, day] = [day, month] } // impossible as M/D, must be D/M
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function mapClaimStatus(v) {
  const s = (v || '').toLowerCase()
  if (!s.trim()) return 'not_applicable'
  if (s.includes('settled')) return 'settled'
  if (s.includes('denied') || s.includes('thrown out') || s.includes('rejected')) return 'denied'
  if (s.includes('received')) return 'form_received'
  if (s.includes('sent')) return 'form_sent'
  if (s.includes('not applicable') || s.includes('n/a')) return 'not_applicable'
  return 'required_not_sent'
}

async function main() {
  const file = process.argv[2]
  const dry = process.argv.includes('--dry')
  const sinceArg = process.argv.find(a => a.startsWith('--since='))
  const since = sinceArg ? sinceArg.slice('--since='.length) : null
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    console.error('--since must be YYYY-MM-DD')
    process.exit(1)
  }
  if (!file) {
    console.error('Usage: node scripts/import-parcel-claims.js path/to/export.csv [--dry] [--since=YYYY-MM-DD]')
    process.exit(1)
  }

  const text = fs.readFileSync(file, 'utf8')
  const rawTable = parseCSV(text)
  if (!rawTable.length) { console.error('CSV appears empty'); process.exit(1) }

  // A raw "whole sheet" export has a colour-key legend block sitting above
  // the real header row (own real-world example: 7 legend rows before
  // "DATE STARTED,Month,HV/LV,..." at row 8) — find the real header row by
  // content rather than assuming row 0, or every row parses against the
  // wrong columns.
  const headerRowIndex = rawTable.findIndex(r => r.some(c => /date start/i.test(c)))
  if (headerRowIndex === -1) {
    console.error('Could not find a "DATE STARTED" header row anywhere in this file — is this the right export?')
    process.exit(1)
  }
  const table = rawTable.slice(headerRowIndex)

  const headers = table[0]
  const col = {
    date: findCol(headers, 'date starte', 'date'),
    name: findCol(headers, 'name'),
    retail: findCol(headers, 'retail'),
    cost: findCol(headers, 'cost'),
    // Deliberately NOT falling back to bare 'claim' — this sheet only ever
    // had a "Claim Ref" column (text), never a numeric claim amount. Falling
    // back would wrongly match "Claim Ref" itself and feed its text into
    // parseNumber, occasionally producing a bogus claim_amount whenever a
    // ref happens to be all-digits (confirmed against a real export: one
    // ref, '6898691180', would have done exactly that).
    claim: findCol(headers, 'claim amount'),
    claimRef: findCol(headers, 'claim ref'),
    status: findCol(headers, 'denial', 'settled'),
    email: findCol(headers, 'email'),
    courier: findCol(headers, 'courier'),
    consignment: findCol(headers, 'consignment'),
    notes: findCol(headers, 'notes'),
  }

  console.log('Detected columns:', col)

  const dataRows = table.slice(1).filter(r => r[col.name]?.trim())
  const parsed = dataRows.map(r => ({
    date_started: parseDate(r[col.date]) || new Date().toISOString().slice(0, 10),
    customer_name: r[col.name]?.trim() || 'Unknown',
    email: r[col.email]?.trim().toLowerCase() || null,
    ebay_username: null, // not tracked in the legacy sheet
    courier: r[col.courier]?.trim() || 'DPD',
    consignment_ref: r[col.consignment]?.trim() || null,
    // Not importing retail — the app doesn't use this field any more
    // (removed 2026-08-31), and this sheet's Retail column has years of
    // stray non-price values typed into it (phone numbers, postcodes —
    // confirmed against a real export). No point carrying that noise in.
    retail: null,
    cost: parseNumber(r[col.cost]),
    claim_amount: parseNumber(r[col.claim]),
    claim_ref: r[col.claimRef]?.trim() || null,
    stage: 'investigating', // colour not exportable — see script header comment
    issue_type: null,
    claim_status: mapClaimStatus(r[col.status]),
    notes: r[col.notes]?.trim() || null,
  }))

  const filtered = since ? parsed.filter(r => r.date_started >= since) : parsed
  if (since) {
    console.log(`--since=${since}: keeping ${filtered.length} of ${parsed.length} parsed rows.`)
  }

  console.log(`Parsed ${filtered.length} rows from ${dataRows.length} source rows.`)
  console.log(since ? 'All rows kept after the --since cutoff:' : 'First 10 parsed rows:')
  console.log(since ? filtered : filtered.slice(0, 10))

  if (dry) {
    console.log('\n--dry passed — nothing written. Re-run without --dry once this looks right.')
    return
  }

  // Same either-name acceptance as lib/supabase.js — the Netlify var is
  // actually saved as SUPABASE_SERVICE_KEY (no "_ROLE").
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!process.env.SUPABASE_URL || !serviceKey) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) not set (checked .env.local and process env).')
    process.exit(1)
  }
  const supabase = createClient(process.env.SUPABASE_URL, serviceKey)

  let inserted = 0
  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('parcel_claims').insert(batch)
    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message)
      process.exit(1)
    }
    inserted += batch.length
    console.log(`Inserted ${inserted}/${filtered.length}…`)
  }

  console.log(`Done — imported ${inserted} rows.`)
}

main().catch(err => { console.error(err); process.exit(1) })
