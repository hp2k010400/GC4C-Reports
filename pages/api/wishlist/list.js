import { getSupabase } from '../../../lib/supabase'
import { applyCors } from '../../../lib/cors'
import { shopifyGraphQL } from '../../../lib/shopify'

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { customerId, guestToken, withDetails } = req.query
  const column = customerId ? 'customer_id' : guestToken ? 'guest_token' : null
  const value = customerId || guestToken
  if (!column) return res.status(400).json({ error: 'customerId or guestToken is required' })

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('wishlist_items')
    .select('product_id, variant_id, created_at')
    .eq(column, value)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  // Bare item list is enough to hydrate heart icons; the wishlist page needs
  // title/image/price too, so it opts in via ?withDetails=1 to avoid an
  // Admin API round trip on every PDP/collection page load.
  if (withDetails && data.length > 0) {
    const gqlData = await shopifyGraphQL(
      `query($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            featuredImage { url(transform: { maxWidth: 400 }) }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
          }
        }
      }`,
      { ids: data.map((i) => i.product_id) }
    )
    const productById = new Map((gqlData.nodes || []).filter(Boolean).map((n) => [n.id, n]))
    for (const item of data) {
      item.product = productById.get(item.product_id) || null
    }
  }

  res.status(200).json({ items: data })
}
