import { shopifyFetchPage } from '../../lib/shopify.js'

export default async function handler(req, res) {
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })
  }

  try {
    const seen = new Set()
    let pageInfo = null
    let consecutivePagesWithNoNewTypes = 0
    let pageCount = 0

    do {
      const params = pageInfo
        ? { page_info: pageInfo }
        : { fields: 'product_type', limit: 250 }

      const { items, nextPageInfo } = await shopifyFetchPage('products.json', 'products', params)

      const sizeBefore = seen.size
      for (const product of items) {
        if (product.product_type) seen.add(product.product_type)
      }

      consecutivePagesWithNoNewTypes = seen.size === sizeBefore
        ? consecutivePagesWithNoNewTypes + 1
        : 0

      pageInfo = nextPageInfo
      pageCount++
    } while (pageInfo && consecutivePagesWithNoNewTypes < 5 && pageCount < 40)

    const types = [...seen].filter(Boolean).sort((a, b) => a.localeCompare(b))

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({ types })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
