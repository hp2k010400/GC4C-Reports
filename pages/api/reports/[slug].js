import { shopifyFetchPage, shopifyGetOne } from '../../../lib/shopify.js'
import { reports } from '../../../lib/reports/index.js'

async function attachCosts(products) {
  const ids = products.flatMap(p => p.variants.map(v => v.inventory_item_id)).filter(Boolean)
  if (!ids.length) return products

  const batches = []
  for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100))

  const results = await Promise.all(
    batches.map(batch =>
      shopifyGetOne('inventory_items.json', { ids: batch.join(','), limit: 100 })
        .then(d => d.inventory_items || []).catch(() => [])
    )
  )
  const costMap = {}
  for (const items of results) for (const item of items) costMap[item.id] = item.cost ?? ''

  return products.map(p => ({
    ...p,
    variants: p.variants.map(v => ({ ...v, _cost: costMap[v.inventory_item_id] ?? '' })),
  }))
}

export default async function handler(req, res) {
  const { slug, startDate, endDate, page_info, productType, vendor, locationId } = req.query
  const report = reports[slug]

  if (!report) return res.status(404).json({ error: 'Report not found' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })
  }

  try {
    const params = page_info
      ? { page_info }
      : report.apiParams({ startDate, endDate, productType, vendor, locationId })

    let { items, nextPageInfo } = await shopifyFetchPage(report.endpoint, report.key, params)

    if (report.fetchCosts) items = await attachCosts(items)

    const rows = report.transform(items)
    res.status(200).json({ rows, nextPageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
