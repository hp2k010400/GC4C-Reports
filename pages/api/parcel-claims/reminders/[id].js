import { getSupabase } from '../../../../lib/supabase'

const EDITABLE_FIELDS = ['title', 'notes', 'due_date', 'done', 'claim_id']

export default async function handler(req, res) {
  const { id } = req.query
  if (req.method === 'PATCH') return handlePatch(req, res, id)
  if (req.method === 'DELETE') return handleDelete(req, res, id)
  return res.status(405).json({ error: 'Method not allowed' })
}

async function handlePatch(req, res, id) {
  const body = req.body || {}
  const patch = {}
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue
    let val = body[key]
    if (typeof val === 'string' && key !== 'due_date') val = val.trim() || null
    patch[key] = val
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'No fields to update' })

  // Stamp/clear done_at alongside done, rather than trusting the client to
  // send both in sync.
  if ('done' in patch) {
    patch.done_at = patch.done ? new Date().toISOString() : null
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('parcel_claim_reminders')
    .update(patch)
    .eq('id', id)
    .select('*, parcel_claims(customer_name, consignment_ref)')
    .single()
  if (error) return res.status(500).json({ error: error.message })

  res.status(200).json({ row: data })
}

async function handleDelete(req, res, id) {
  const supabase = getSupabase()
  const { error } = await supabase.from('parcel_claim_reminders').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })

  res.status(200).json({ ok: true })
}
