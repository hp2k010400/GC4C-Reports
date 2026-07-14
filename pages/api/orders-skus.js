import { shopifyFetchPage } from '../../lib/shopify.js'

// Fetch 7 Shopify pages per Netlify call (7 × 250 = 1750 orders).
// Each Shopify call ~500-700ms so 7 pages ≈ 4-5s, safely within Netlify's 10s limit.
// Reduces client↔server round trips ~7x vs fetching one page at a time.
//
// No in-function retry here on purpose: retrying with backoff *inside* one
// invocation risks the sleep time alone pushing past Netlify's 10s limit,
// which caused hard-to-reproduce failures deep into long runs. Instead this
// throws immediately on a transient error and the client (deletion-candidates.js)
// retries the same page as a fresh function call with its own full time budget.
const PAGES_PER_CALL = 7

export default async function handler(req, res) {
  const { page_info, startDate, endDate } = req.query

  try {
    const skus = []
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
            limit: 250,
          }

      const { items, nextPageInfo: next } = await shopifyFetchPage('orders.json', 'orders', params)

      for (const order of items) {
        for (const item of order.line_items || []) {
          if (item.sku) skus.push(String(item.sku).trim())
        }
      }

      currentPageInfo = next
      nextPageInfo = next
      pagesCount++
    } while (currentPageInfo && pagesCount < PAGES_PER_CALL)

    res.status(200).json({ skus, nextPageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
