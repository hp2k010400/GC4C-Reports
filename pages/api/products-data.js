import { shopifyFetchPage, shopifyGetOne } from '../../lib/shopify.js'

const PAGES_PER_CALL = 2

async function fetchCostMap(inventoryItemIds) {
  if (!inventoryItemIds.length) return {}
  const batches = []
  for (let i = 0; i < inventoryItemIds.length; i += 100) {
    batches.push(inventoryItemIds.slice(i, i + 100))
  }
  const results = await Promise.all(
    batches.map(ids =>
      shopifyGetOne('inventory_items.json', { ids: ids.join(','), limit: 100 })
        .then(d => d.inventory_items || [])
        .catch(() => [])
    )
  )
  const map = {}
  for (const items of results) {
    for (const item of items) {
      map[item.id] = item.cost ?? ''
    }
  }
  return map
}

export default async function handler(req, res) {
  const { page_info, product_type, vendor, status } = req.query

  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })
  }

  try {
    let allProducts = []
    let currentPageInfo = page_info || null
    let nextPageInfo = null
    let pagesCount = 0

    do {
      const params = currentPageInfo
        ? { page_info: currentPageInfo }
        : {
            fields: 'id,title,vendor,product_type,status,tags,handle,variants,created_at,updated_at,images,published_at',
            limit: 250,
            ...(product_type ? { product_type } : {}),
            ...(vendor       ? { vendor }        : {}),
            ...(status       ? { status }         : {}),
          }

      const { items, nextPageInfo: next } = await shopifyFetchPage('products.json', 'products', params)
      allProducts = allProducts.concat(items)
      currentPageInfo = next
      nextPageInfo = next
      pagesCount++
    } while (currentPageInfo && pagesCount < PAGES_PER_CALL)

    const inventoryItemIds = allProducts.flatMap(p => p.variants.map(v => v.inventory_item_id)).filter(Boolean)
    const costMap = await fetchCostMap(inventoryItemIds)

    const allRows = allProducts.flatMap(product =>
      product.variants.map(v => ({
        'Product ID':   product.id,
        'Variant ID':   v.id,
        'Title':        product.title,
        'Variant':      v.title !== 'Default Title' ? v.title : '',
        'SKU':          v.sku || '',
        'Barcode':      v.barcode || '',
        'Type':         product.product_type || '',
        'Brand':        product.vendor || '',
        'Status':       product.status,
        'Online Store': product.published_at ? 'Yes' : 'No',
        'Tags':         product.tags || '',
        'Price':        v.price,
        'Compare At':   v.compare_at_price || '',
        'Cost Price':   costMap[v.inventory_item_id] ?? '',
        'Inventory':    v.inventory_quantity,
        'Date Created': product.created_at ? product.created_at.slice(0, 10) : '',
        'Date Updated': product.updated_at  ? product.updated_at.slice(0, 10)  : '',
        'Handle':       product.handle,
        'Has Images':   (product.images?.length ?? 0) > 0 ? 'Yes' : 'No',
      }))
    )

    res.status(200).json({ rows: allRows, nextPageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
