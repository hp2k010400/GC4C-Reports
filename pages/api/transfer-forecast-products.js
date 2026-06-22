import { shopifyFetchPage } from '../../lib/shopify.js'

// Returns product meta + inventory_item_id only — no inventory levels.
// Inventory is fetched separately after orders load, targeting only sold SKUs.
const PAGES_PER_CALL = 4

export default async function handler(req, res) {
  const { page_info } = req.query
  try {
    let products = []
    let currentPageInfo = page_info || null
    let nextPageInfo = null
    let pagesCount = 0

    do {
      const params = currentPageInfo
        ? { page_info: currentPageInfo }
        : { fields: 'id,title,vendor,product_type,variants', limit: 250, status: 'active' }

      const { items, nextPageInfo: next } = await shopifyFetchPage('products.json', 'products', params)
      products = products.concat(items)
      currentPageInfo = next
      nextPageInfo = next
      pagesCount++
    } while (currentPageInfo && pagesCount < PAGES_PER_CALL)

    const rows = products.flatMap(p =>
      p.variants.map(v => ({
        sku:     v.sku || '',
        iid:     v.inventory_item_id,
        title:   p.title,
        variant: v.title !== 'Default Title' ? v.title : '',
        type:    p.product_type || '',
        brand:   p.vendor || '',
      }))
    )

    res.status(200).json({ rows, nextPageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
