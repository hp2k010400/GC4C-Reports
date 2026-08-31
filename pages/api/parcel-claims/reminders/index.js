import { getSupabase } from '../../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  return res.status(405).json({ error: 'Method not allowed' })
}

// Powers the Calendar tab: the visible month's reminders (from/to), plus —
// regardless of which month is on screen — anything overdue and not done
// yet, so a missed reminder from last month can't silently scroll out of
// view. `includeDone=1` pulls done ones back in too (for the month grid,
// shown struck-through rather than hidden).
async function handleGet(req, res) {
  const { from, to, includeDone } = req.query
  const supabase = getSupabase()

  const select = '*, parcel_claims(customer_name, consignment_ref)'

  let monthQuery = supabase.from('parcel_claim_reminders').select(select)
  if (from) monthQuery = monthQuery.gte('due_date', from)
  if (to) monthQuery = monthQuery.lte('due_date', to)
  if (includeDone !== '1') monthQuery = monthQuery.eq('done', false)

  const today = new Date().toISOString().slice(0, 10)
  const overdueQuery = supabase
    .from('parcel_claim_reminders')
    .select(select)
    .lt('due_date', today)
    .eq('done', false)

  const [monthRes, overdueRes] = await Promise.all([
    monthQuery.order('due_date', { ascending: true }),
    overdueQuery.order('due_date', { ascending: true }),
  ])
  if (monthRes.error) return res.status(500).json({ error: monthRes.error.message })
  if (overdueRes.error) return res.status(500).json({ error: overdueRes.error.message })

  // Merge without duplicating anything that's both overdue and in-range.
  const byId = new Map()
  for (const r of [...overdueRes.data, ...monthRes.data]) byId.set(r.id, r)

  res.status(200).json({
    rows: [...byId.values()],
    overdueCount: overdueRes.data.length,
  })
}

async function handlePost(req, res) {
  const body = req.body || {}
  if (!body.title || !body.title.trim()) {
    return res.status(400).json({ error: 'Title is required' })
  }
  if (!body.due_date) {
    return res.status(400).json({ error: 'Due date is required' })
  }

  const row = {
    claim_id: body.claim_id || null,
    title: body.title.trim(),
    notes: body.notes?.trim() || null,
    due_date: body.due_date,
    created_by: body.created_by?.trim() || null,
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('parcel_claim_reminders')
    .insert(row)
    .select('*, parcel_claims(customer_name, consignment_ref)')
    .single()
  if (error) return res.status(500).json({ error: error.message })

  res.status(200).json({ row: data })
}
