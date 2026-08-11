#!/usr/bin/env node
/**
 * One-off import of the legacy "Operations & Comms Sheet" missing-parcels
 * tab(s) into the new `parcel_claims` Supabase table.
 *
 * Usage:
 *   node scripts/import-parcel-claims.js path/to/export.csv [--dry]
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
 * KNOWN LIMITATION: Excel cell background colour (the sheet's colour-coded
 * status key) is not exported to CSV, so `stage`/`issue_type` cannot be
 * inferred here and are left at their defaults ('investigating' / null) for
 * every imported row. The team should re-triage stage for older rows over
 * time using the new dropdown in the app — status/denial info still comes
 * across fine via the Denial/Settled column below.
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
function parseDate(v) {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s // already ISO
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  let [, a, b, y] = m
  if (y.length === 2) y = `20${y}`
  const month = a.padStart(2, '0'), day = b.padStart(2, '0')
  return `${y}-${month}-${day}`
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
  if (!file) {
    console.error('Usage: node scripts/import-parcel-claims.js path/to/export.csv [--dry]')
    process.exit(1)
  }

  const text = fs.readFileSync(file, 'utf8')
  const table = parseCSV(text)
  if (!table.length) { console.error('CSV appears empty'); process.exit(1) }

  const headers = table[0]
  const col = {
    date: findCol(headers, 'date starte', 'date'),
    name: findCol(headers, 'name'),
    retail: findCol(headers, 'retail'),
    cost: findCol(headers, 'cost'),
    claim: findCol(headers, 'claim amount', 'claim'),
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
    retail: parseNumber(r[col.retail]),
    cost: parseNumber(r[col.cost]),
    claim_amount: parseNumber(r[col.claim]),
    claim_ref: r[col.claimRef]?.trim() || null,
    stage: 'investigating', // colour not exportable — see script header comment
    issue_type: null,
    claim_status: mapClaimStatus(r[col.status]),
    notes: r[col.notes]?.trim() || null,
  }))

  console.log(`Parsed ${parsed.length} rows from ${dataRows.length} source rows.`)
  console.log('First 10 parsed rows:')
  console.log(parsed.slice(0, 10))

  if (dry) {
    console.log('\n--dry passed — nothing written. Re-run without --dry once this looks right.')
    return
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (checked .env.local and process env).')
    process.exit(1)
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  let inserted = 0
  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const batch = parsed.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('parcel_claims').insert(batch)
    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message)
      process.exit(1)
    }
    inserted += batch.length
    console.log(`Inserted ${inserted}/${parsed.length}…`)
  }

  console.log(`Done — imported ${inserted} rows.`)
}

main().catch(err => { console.error(err); process.exit(1) })
