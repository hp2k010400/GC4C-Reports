import { getSupabase } from '../../../lib/supabase'
import { applyCors } from '../../../lib/cors'
import { getIdentity } from '../../../lib/wishlist-identity'

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { productId, customerId, guestToken } = req.body || {}
  if (!productId) return res.status(400).json({ error: 'productId is required' })

  let identity
  try {
    identity = getIdentity({ customerId, guestToken })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const supabase = getSupabase()
  const column = identity.customer_id ? 'customer_id' : 'guest_token'
  const value = identity.customer_id || identity.guest_token

  const { error } = await supabase
    .from('wishlist_items')
    .delete()
    .eq(column, value)
    .eq('product_id', productId)

  if (error) return res.status(500).json({ error: error.message })

  await supabase.from('wishlist_events').insert({
    event_type: 'remove',
    ...identity,
    product_id: productId,
  })

  res.status(200).json({ ok: true })
}
