import { shopifyFetchAll } from '../shopify.js'

export async function fetchInventoryOnHand() {
  const products = await shopifyFetchAll('products.json', 'products', {
    fields: 'id,title,vendor,product_type,variants',
    status: 'active',
  })

  return products
    .flatMap(product =>
      product.variants.map(v => ({
        SKU: v.sku || '—',
        Product: product.title,
        Variant: v.title !== 'Default Title' ? v.title : '—',
        Brand: product.vendor || '—',
        Type: product.product_type || '—',
        Available: v.inventory_quantity,
        Price: `£${parseFloat(v.price).toFixed(2)}`,
      }))
    )
    .sort((a, b) => a.SKU.localeCompare(b.SKU))
}
