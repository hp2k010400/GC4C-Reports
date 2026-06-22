import { shopifyFetchPage } from '../../lib/shopify.js'

export default async function handler(_req, res) {
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })
  }

  try {
    const seen = new Set()
    let pageInfo = null
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
    } while (pageInfo && pageCount < 30)

    const vendors = [...seen].filter(Boolean).sort((a, b) => a.localeCompare(b))

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({ vendors })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
