import { getSupabase } from '../../../lib/supabase'
import { isValidStage, isValidIssueType, isValidClaimStatus, today } from '../../../lib/parcelClaims'

const EDITABLE_FIELDS = [
  'date_started', 'customer_name', 'email', 'ebay_username', 'courier',
  'consignment_ref', 'retail', 'cost', 'claim_amount', 'claim_ref', 'weight_kg',
  'stage', 'issue_type', 'claim_status', 'claim_form_sent_at',
  'claim_form_received_at', 'notes', 'handled_by',
]
const NUMERIC_FIELDS = ['retail', 'cost', 'claim_amount', 'weight_kg']

export default async function handler(req, res) {
  const { id } = req.query
  if (req.method === 'PATCH') return handlePatch(req, res, id)
  if (req.method === 'DELETE') return handleDelete(req, res, id)
  return res.status(405).json({ error: 'Method not allowed' })
}

async function handlePatch(req, res, id) {
  const body = req.body || {}
  if (body.stage != null && !isValidStage(body.stage)) {
    return res.status(400).json({ error: `Invalid stage: ${body.stage}` })
  }
  if (body.issue_type !== undefined && !isValidIssueType(body.issue_type)) {
    return res.status(400).json({ error: `Invalid issue_type: ${body.issue_type}` })
  }
  if (body.claim_status != null && !isValidClaimStatus(body.claim_status)) {
    return res.status(400).json({ error: `Invalid claim_status: ${body.claim_status}` })
  }

  const patch = {}
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue
    let val = body[key]
    if (NUMERIC_FIELDS.includes(key)) {
      val = val === '' || val == null ? null : Number(val)
    } else if (typeof val === 'string') {
      val = val.trim() || null
    }
    patch[key] = val
  }

  // Auto-stamp the sent/received dates the first time a claim moves into
  // that stage, so the team doesn't have to remember to set them by hand —
  // still overridable via claim_form_sent_at/claim_form_received_at above.
  if (patch.claim_status === 'form_sent' && !('claim_form_sent_at' in patch)) {
    patch.claim_form_sent_at = today()
  }
  if (patch.claim_status === 'form_received' && !('claim_form_received_at' in patch)) {
    patch.claim_form_received_at = today()
  }

  if (!Object.keys(patch).length) return res.status(400).json({ error: 'No fields to update' })
  patch.updated_at = new Date().toISOString()

  const supabase = getSupabase()
  const { data, error } = await supabase.from('parcel_claims').update(patch).eq('id', id).select().single()
  if (error) return res.status(500).json({ error: error.message })

  res.status(200).json({ row: data })
}

async function handleDelete(req, res, id) {
  const supabase = getSupabase()
  const { error } = await supabase.from('parcel_claims').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })

  res.status(200).json({ ok: true })
}
