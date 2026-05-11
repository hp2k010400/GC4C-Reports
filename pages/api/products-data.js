import { shopifyFetchPage } from '../../lib/shopify.js'

const PAGES_PER_CALL = 4

export default async function handler(req, res) {
  const { page_info, product_type, vendor, status } = req.query

  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })
  }

  try {
    let allRows = []
    let currentPageInfo = page_info || null
    let nextPageInfo = null
    let pagesCount = 0

    do {
      const params = currentPageInfo
        ? { page_info: currentPageInfo }
        : {
            fields: 'id,title,vendor,product_type,status,tags,handle,variants,created_at,updated_at',
            limit: 250,
            ...(product_type ? { product_type } : {}),
            ...(vendor       ? { vendor }        : {}),
            ...(status       ? { status }         : {}),
          }

      const { items, nextPageInfo: next } = await shopifyFetchPage('products.json', 'products', params)

      const rows = items.flatMap(product =>
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
          'Tags':         product.tags || '',
          'Price':        v.price,
          'Compare At':   v.compare_at_price || '',
          'Inventory':    v.inventory_quantity,
          'Date Created': product.created_at ? product.created_at.slice(0, 10) : '',
          'Date Updated': product.updated_at  ? product.updated_at.slice(0, 10)  : '',
          'Handle':       product.handle,
        }))
      )

      allRows = allRows.concat(rows)
      currentPageInfo = next
      nextPageInfo = next
      pagesCount++
    } while (currentPageInfo && pagesCount < PAGES_PER_CALL)

    res.status(200).json({ rows: allRows, nextPageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
