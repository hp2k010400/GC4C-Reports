import { shopifyFetchPage } from '../../lib/shopify.js'

// Same reasoning as orders-skus.js: cap pages per Netlify call so a large
// catalog can't push a single function invocation past the 10s timeout.
const PAGES_PER_CALL = 7

export default async function handler(req, res) {
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })
  }

  try {
    const seen = new Set()
    let pageInfo = req.query.page_info || null
    let pageCount = 0

    do {
      const params = pageInfo
        ? { page_info: pageInfo }
        : { fields: 'vendor', limit: 250 }

      const { items, nextPageInfo } = await shopifyFetchPage('products.json', 'products', params)

      for (const product of items) {
        if (product.vendor) seen.add(product.vendor)
      }

      pageInfo = nextPageInfo
      pageCount++
    } while (pageInfo && pageCount < PAGES_PER_CALL)

    const vendors = [...seen].filter(Boolean)

    res.status(200).json({ vendors, nextPageInfo: pageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
