import { fetchSalesBySku } from './sales-by-sku.js'
import { fetchInventoryOnHand } from './inventory-on-hand.js'

export const reports = {
  'sales-by-sku': {
    name: 'Sales by SKU',
    description: 'All orders broken down by SKU, product, variant, quantity and revenue. SKU always populated from raw Shopify data.',
    requiresDates: true,
    fetch: fetchSalesBySku,
  },
  'inventory-on-hand': {
    name: 'Inventory on Hand',
    description: 'Current live stock levels for all active products across all variants.',
    requiresDates: false,
    fetch: fetchInventoryOnHand,
  },
}
