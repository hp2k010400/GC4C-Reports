import { shopifyFetchPage } from '../../lib/shopify.js'

// Fetches POS orders for a specific location.
// Using location_id filter means Shopify returns only POS orders for that store,
// keeping page counts low vs fetching all orders and discarding web ones.
const PAGES_PER_CALL = 5

export default async function handler(req, res) {
  const { page_info, startDate, endDate, location_id } = req.query

  if (!location_id) return res.status(400).json({ error: 'location_id required' })

  try {
    let allRows = []
    let currentPageInfo = page_info || null
    let nextPageInfo = null
    let pagesCount = 0

    do {
      const params = currentPageInfo
        ? { page_info: currentPageInfo }
        : {
            status: 'any',
            fields: 'id,line_items',
            created_at_min: new Date(startDate).toISOString(),
            created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
            location_id,
            limit: 250,
          }

      const { items, nextPageInfo: next } = await shopifyFetchPage('orders.json', 'orders', params)

      for (const order of items) {
        for (const item of order.line_items || []) {
          if (!item.sku) continue
          allRows.push({ sku: item.sku, qty: item.quantity })
        }
      }

      currentPageInfo = next
      nextPageInfo = next
      pagesCount++
    } while (currentPageInfo && pagesCount < PAGES_PER_CALL)

    res.status(200).json({ rows: allRows, nextPageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
