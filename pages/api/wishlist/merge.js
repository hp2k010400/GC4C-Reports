import { getSupabase } from '../../../lib/supabase'
import { applyCors } from '../../../lib/cors'

// Moves a guest's wishlist onto their account after login. Items already on the
// account (added from another device) are left as-is; the guest rows are dropped either way.
export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { customerId, guestToken } = req.body || {}
  if (!customerId || !guestToken) {
    return res.status(400).json({ error: 'customerId and guestToken are required' })
  }

  const supabase = getSupabase()

  const { data: guestItems, error: fetchError } = await supabase
    .from('wishlist_items')
    .select('product_id, variant_id')
    .eq('guest_token', guestToken)

  if (fetchError) return res.status(500).json({ error: fetchError.message })

  for (const item of guestItems || []) {
    const { error: insertError } = await supabase.from('wishlist_items').insert({
      customer_id: customerId,
      guest_token: null,
      product_id: item.product_id,
      variant_id: item.variant_id,
    })
    if (insertError && insertError.code !== '23505') {
      return res.status(500).json({ error: insertError.message })
    }
    await supabase.from('wishlist_events').insert({
      event_type: 'merge',
      customer_id: customerId,
      product_id: item.product_id,
    })
  }

  await supabase.from('wishlist_items').delete().eq('guest_token', guestToken)

  res.status(200).json({ ok: true, merged: guestItems?.length || 0 })
}
