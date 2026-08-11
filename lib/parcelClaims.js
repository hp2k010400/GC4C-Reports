// Shared constants for the Missing Parcels / Courier Claims tracker.
// Single source of truth for both the page (pages/parcel-claims.js) and the
// API routes (pages/api/parcel-claims/*) so status values can't drift apart.

// Practical max DPD (and most couriers) will pay out per parcel — flag any
// claim/cost above this that isn't settled yet so it doesn't get missed.
export const CLAIM_CAP = 120

export const COURIERS = ['DPD', 'FedEx', 'Royal Mail', 'Evri', 'UPS', 'Other']

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
// optional / only set once known. Colours match that legend exactly
// (Lime/Light Blue/Yellow/Grey/Sky Blue).
export const ISSUE_TYPES = [
  { value: 'rts_after_deemed_lost',  label: 'RTS After Deemed Lost',        colour: 'issue-lime' },
  { value: 'never_scanned',          label: 'Never Scanned Once Collected', colour: 'issue-light-blue' },
  { value: 'drop_off_shop_issue',    label: 'Drop Off Shop Issue',          colour: 'issue-yellow' },
  { value: 'lod_sent_not_refunded',  label: 'LOD Sent, Not Refunded Yet',   colour: 'issue-grey' },
  { value: 'mislabeled_by_courier',  label: 'Mis-Labelled by Courier',      colour: 'issue-sky-blue' },
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
