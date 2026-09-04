// Shared constants for the Missing Parcels / Courier Claims tracker.
// Single source of truth for both the page (pages/parcel-claims.js) and the
// API routes (pages/api/parcel-claims/*) so status values can't drift apart.

// How much of the item's cost we stand to lose off this claim — null unless
// both cost and claim amount are known. Positive = we're claiming for less
// than the item cost (a real loss); negative = we're claiming for more than
// it cost (we come out up). Used only for the all-time "Shortfall" stat card
// (open cases only, a forward-looking risk figure — see stats.js). Superseded
// the old weight-based (£12/kg) DPD payout estimate on 2026-08-31 — the team
// now enters the real amount being claimed for directly, so there's no need
// to estimate a payout from weight any more.
export function shortfall(row) {
  if (row?.cost == null || row.cost === '' || row?.claim_amount == null || row.claim_amount === '') return null
  return Math.round((Number(row.cost) - Number(row.claim_amount)) * 100) / 100
}

// The per-row LOSS/GAIN badge — this is about the real financial outcome of
// a claim, not just its in-flight status, so unlike shortfall() above it:
//  (a) prefers recovered_amount (what DPD actually paid) once known, only
//      falling back to claim_amount while still waiting on an answer, and
//  (b) is never hidden once a case closes — per Phil Barron 2026-09-04,
//      that's exactly the moment the *real* number becomes known, so hiding
//      it there was backwards. Positive = LOSS (claimed/recovered for less
//      than the item cost — money that's genuinely gone). Negative = GAIN
//      (claimed/recovered for more than it cost).
export function costOutcome(row) {
  const known = (row?.recovered_amount != null && row.recovered_amount !== '') ? row.recovered_amount : row?.claim_amount
  if (row?.cost == null || row.cost === '' || known == null || known === '') return null
  return Math.round((Number(row.cost) - Number(known)) * 100) / 100
}

export const COURIERS = ['DPD', 'FedEx', 'Royal Mail', 'Evri', 'UPS', 'Other']

// High Value / Low Value triage tag — free text rather than a strict enum,
// since the old sheet's equivalent column also picked up other one-off notes
// over the years (DEL, Returned, etc). LV/HV are the two clean options
// offered on the add-claim form; anything else just displays as-is.
export const VALUE_TIERS = ['LV', 'HV']

// Replaces the old sheet's colour key (column A) — overall case status.
// Colours match the legend exactly (Clear/Orange/Red/Purple/Green/Beige) so
// the team can recognise a case's status by colour the same way they do today.
export const STAGES = [
  { value: 'investigating',          label: 'Investigating',          colour: 'stage-clear' },    // Clear
  { value: 'lost_refunded_hv',       label: 'Lost / Refunded (HV)',   colour: 'stage-orange' },   // Orange
  { value: 'claim_processed',        label: 'Claim Processed',        colour: 'stage-red' },       // Red
  { value: 'claim_thrown_out',       label: 'Claim Thrown Out',       colour: 'stage-purple' },    // Purple
  { value: 'delivered_ok',           label: 'Delivered OK',           colour: 'stage-green' },     // Green
  { value: 'delivered_after_refund', label: 'Delivered After Refund', colour: 'stage-beige' },     // Beige
]

// Replaces the old sheet's second colour key (column E) — underlying issue,
// optional / only set once known. First 5 colours match that legend exactly
// (Lime/Light Blue/Yellow/Grey/Sky Blue) — DOR Sent/Received Back are new
// (requested by Phil Barron 2026-09-01, not part of the legacy colour key),
// so they get new colours rather than reusing one of the above.
export const ISSUE_TYPES = [
  { value: 'rts_after_deemed_lost',  label: 'RTS After Deemed Lost',        colour: 'issue-lime' },
  { value: 'never_scanned',          label: 'Never Scanned Once Collected', colour: 'issue-light-blue' },
  { value: 'drop_off_shop_issue',    label: 'Drop Off Shop Issue',          colour: 'issue-yellow' },
  { value: 'lod_sent_not_refunded',  label: 'LOD Sent, Not Refunded Yet',   colour: 'issue-grey' },
  { value: 'mislabeled_by_courier',  label: 'Mis-Labelled by Courier',      colour: 'issue-sky-blue' },
  { value: 'dor_sent',               label: 'DOR Sent',                     colour: 'issue-teal' },
  { value: 'dor_received_back',      label: 'DOR Received Back',            colour: 'issue-pink' },
  { value: 'out_of_sla',             label: 'Out of SLA',                   colour: 'issue-indigo' },
]

// Replaces the old single Denial/Settled tick with a real claim-form pipeline.
export const CLAIM_STATUSES = [
  { value: 'not_applicable',   label: 'Not Applicable',    colour: 'claim-na' },
  { value: 'required_not_sent',label: 'Required — Not Sent',colour: 'claim-required' },
  { value: 'form_sent',        label: 'Claim Form Sent',   colour: 'claim-sent' },
  { value: 'form_received',    label: 'Claim Form Received', colour: 'claim-received' },
  { value: 'settled',          label: 'Settled',           colour: 'claim-settled' },
  { value: 'denied',           label: 'Denied',            colour: 'claim-denied' },
]

// Cases that no longer need day-to-day attention — excluded from the default
// (open-only) list view.
export const CLOSED_STAGES = ['delivered_ok']
export const CLOSED_CLAIM_STATUSES = ['settled', 'denied']

export function stageLabel(value) {
  return STAGES.find(s => s.value === value)?.label || value || '—'
}
export function stageColour(value) {
  return STAGES.find(s => s.value === value)?.colour || ''
}

// Whole-row background tint per stage — mirrors the old sheet's habit of
// colour-filling the entire row, not just one cell, so a case's status
// reads at a glance down the table (kept pale so text/inputs stay legible).
const STAGE_ROW_BG = {
  investigating: '#f7f7f8',
  lost_refunded_hv: '#fff6ea',
  claim_processed: '#fdeeee',
  claim_thrown_out: '#f5f0fc',
  delivered_ok: '#edfaf1',
  delivered_after_refund: '#faf4ea',
}
export function stageRowBg(value) {
  return STAGE_ROW_BG[value] || 'transparent'
}
export function issueLabel(value) {
  return ISSUE_TYPES.find(i => i.value === value)?.label || value || '—'
}
export function issueColour(value) {
  return ISSUE_TYPES.find(i => i.value === value)?.colour || ''
}
export function claimStatusLabel(value) {
  return CLAIM_STATUSES.find(c => c.value === value)?.label || value || '—'
}
export function claimStatusColour(value) {
  return CLAIM_STATUSES.find(c => c.value === value)?.colour || ''
}

export function fmtGbp(n) {
  const v = Number(n)
  if (!isFinite(v)) return '£0.00'
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-')
  if (!y || !m || !day) return '—'
  return `${day}/${m}/${y}`
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

// Server-side validation guard — API routes reject anything not in these sets
// rather than trusting the client.
export function isValidStage(v) { return STAGES.some(s => s.value === v) }
export function isValidIssueType(v) { return v == null || v === '' || ISSUE_TYPES.some(i => i.value === v) }
export function isValidClaimStatus(v) { return CLAIM_STATUSES.some(c => c.value === v) }
