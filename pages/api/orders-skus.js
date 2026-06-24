import { shopifyFetchPage } from '../../lib/shopify.js'

// Fetch 15 Shopify pages per Netlify call (15 × 250 = 3750 orders).
// Each Shopify call ~300-400ms so 15 pages ≈ 5-6s, safely within Netlify's 10s limit.
// Reduces client↔server round trips ~15x vs fetching one page at a time.
const PAGES_PER_CALL = 15

async function fetchWithRetry(params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await shopifyFetchPage('orders.json', 'orders', params)
    } catch (err) {
      const transient = /502|503|504|rate|throttl/i.test(err.message)
      if (transient && i < retries - 1) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1)))
        continue
      }
      throw err
    }
  }
}

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

      const { items, nextPageInfo: next } = await fetchWithRetry(params)

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
