import { shopifyFetchPage } from '../../lib/shopify.js'

export default async function handler(_req, res) {
  const { items } = await shopifyFetchPage('orders.json', 'orders', {
    status: 'any',
    limit: 100,
    fields: 'id,name,source_name,location_id,created_at',
  })

  const summary = {}
  for (const order of items) {
    const key = `source_name="${order.source_name || 'null'}" / location_id="${order.location_id || 'null'}"`
    summary[key] = (summary[key] || 0) + 1
  }

  res.status(200).json({
    total: items.length,
    breakdown: summary,
    sample: items.slice(0, 5).map(o => ({
      order: o.name,
      source_name: o.source_name,
      location_id: o.location_id,
      date: o.created_at?.slice(0, 10),
    })),
  })
}
