import { shopifyFetchPage } from '../../lib/shopify.js'

export default async function handler(req, res) {
  const { page_info, startDate, endDate } = req.query

  try {
    const params = page_info
      ? { page_info }
      : {
          status: 'any',
          fields: 'id,line_items',
          created_at_min: new Date(startDate).toISOString(),
          created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
          limit: 250,
        }

    const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)

    const skus = []
    for (const order of items) {
      for (const item of order.line_items || []) {
        if (item.sku) skus.push(String(item.sku).trim())
      }
    }

    res.status(200).json({ skus, nextPageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
