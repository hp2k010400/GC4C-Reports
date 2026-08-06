import { getSupabase } from '../../../lib/supabase'
import { applyCors } from '../../../lib/cors'
import { getIdentity } from '../../../lib/wishlist-identity'

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { productId, variantId, customerId, guestToken } = req.body || {}
  if (!productId) return res.status(400).json({ error: 'productId is required' })

  let identity
  try {
    identity = getIdentity({ customerId, guestToken })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const supabase = getSupabase()

  const { error: insertError } = await supabase.from('wishlist_items').insert({
    ...identity,
    product_id: productId,
    variant_id: variantId || null,
  })

  // 23505 = unique_violation - item is already wishlisted, treat as success
  if (insertError && insertError.code !== '23505') {
    return res.status(500).json({ error: insertError.message })
  }

  await supabase.from('wishlist_events').insert({
    event_type: 'add',
    ...identity,
    product_id: productId,
  })

  res.status(200).json({ ok: true })
}
