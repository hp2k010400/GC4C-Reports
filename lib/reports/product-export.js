import { shopifyFetchAll } from '../shopify.js'

export async function fetchProductExport() {
  const products = await shopifyFetchAll('products.json', 'products', {
    fields: 'id,title,vendor,product_type,status,tags,variants,created_at',
  })

  return products.flatMap(product =>
    product.variants.map(v => ({
      'Product ID': product.id,
      'Variant ID': v.id,
      'Date Created': product.created_at ? product.created_at.slice(0, 10) : '',
      'SKU': v.sku || '',
      'Title': product.title,
      'Variant': v.title !== 'Default Title' ? v.title : '',
      'Price': v.price,
      'Compare At Price': v.compare_at_price || '',
      'Inventory': v.inventory_quantity,
      'Brand': product.vendor || '',
      'Type': product.product_type || '',
      'Status': product.status,
      'Barcode': v.barcode || '',
      'Tags': product.tags || '',
    }))
  )
}
