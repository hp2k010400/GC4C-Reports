import { shopifyFetchPage, shopifyGetOne } from '../../lib/shopify.js'

const PAGES_PER_CALL = 2
const INV_BATCH = 40  // 40 items × up to 6 locations = 240 levels, safely under Shopify's 250 limit

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

    const iids = products.flatMap(p => p.variants.map(v => v.inventory_item_id)).filter(Boolean)

    const batches = []
    for (let i = 0; i < iids.length; i += INV_BATCH) batches.push(iids.slice(i, i + INV_BATCH))

    const levelArrays = await Promise.all(
      batches.map(batch =>
        shopifyGetOne('inventory_levels.json', { inventory_item_ids: batch.join(','), limit: 250 })
          .then(d => d.inventory_levels || [])
          .catch(() => [])
      )
    )

    // iid -> { locationId: available }
    const iidToLevels = {}
    for (const levels of levelArrays) {
      for (const level of levels) {
        const iid = level.inventory_item_id
        if (!iidToLevels[iid]) iidToLevels[iid] = {}
        iidToLevels[iid][String(level.location_id)] = level.available ?? 0
      }
    }

    const rows = products.flatMap(p =>
      p.variants.map(v => ({
        sku:       v.sku || '',
        title:     p.title,
        variant:   v.title !== 'Default Title' ? v.title : '',
        type:      p.product_type || '',
        brand:     p.vendor || '',
        inventory: iidToLevels[v.inventory_item_id] || {},
      }))
    )

    res.status(200).json({ rows, nextPageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
