import { getSupabase } from '../../../lib/supabase'

// Full claim history for one customer, regardless of status — used by the
// "previous claims for this customer" expand on pages/parcel-claims.js.
// Matches on email OR eBay username OR exact name, since some customers only
// have one of the three on file.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { email, ebay, name, excludeId } = req.query
  if (!email && !ebay && !name) return res.status(400).json({ error: 'email, ebay or name is required' })

  const supabase = getSupabase()
  const conditions = []
  if (email) conditions.push(`email.ilike.${email.trim()}`)
  if (ebay) conditions.push(`ebay_username.ilike.${ebay.trim()}`)
  if (name) conditions.push(`customer_name.ilike.${name.trim()}`)

  let query = supabase
    .from('parcel_claims')
    .select('*')
    .or(conditions.join(','))
    .order('date_started', { ascending: false })

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  res.status(200).json({ rows: data })
}
