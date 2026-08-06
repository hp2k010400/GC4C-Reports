import { getSupabase } from '../../lib/supabase'
import { shopifyGraphQL } from '../../lib/shopify'

export default async function handler(req, res) {
  const { startDate, endDate } = req.query
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate are required' })

  const supabase = getSupabase()

  const { data: events, error } = await supabase
    .from('wishlist_events')
    .select('event_type, product_id')
    .gte('created_at', `${startDate}T00:00:00Z`)
    .lte('created_at', `${endDate}T23:59:59Z`)

  if (error) return res.status(500).json({ error: error.message })

  const byProduct = new Map()
  for (const { event_type, product_id } of events) {
    const row = byProduct.get(product_id) || { productId: product_id, adds: 0, removes: 0 }
    if (event_type === 'add') row.adds += 1
    else if (event_type === 'remove') row.removes += 1
    byProduct.set(product_id, row)
  }

  const topProducts = [...byProduct.values()]
    .map((r) => ({ ...r, net: r.adds - r.removes }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 50)

  if (topProducts.length > 0) {
    const gqlData = await shopifyGraphQL(
      `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id title handle } } }`,
      { ids: topProducts.map((p) => p.productId) }
    )
    const titleById = new Map((gqlData.nodes || []).filter(Boolean).map((n) => [n.id, n]))
    for (const row of topProducts) {
      const product = titleById.get(row.productId)
      row.title = product?.title || row.productId
      row.handle = product?.handle || null
    }
  }

  const { count: currentlyWishlisted } = await supabase
    .from('wishlist_items')
    .select('*', { count: 'exact', head: true })

  res.status(200).json({
    summary: {
      totalAdds: events.filter((e) => e.event_type === 'add').length,
      totalRemoves: events.filter((e) => e.event_type === 'remove').length,
      currentlyWishlisted: currentlyWishlisted || 0,
    },
    topProducts,
  })
}
