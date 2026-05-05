import { shopifyFetchAll } from '../shopify.js'

export async function fetchSalesBySku({ startDate, endDate }) {
  const orders = await shopifyFetchAll('orders.json', 'orders', {
    status: 'any',
    created_at_min: new Date(startDate).toISOString(),
    created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
    fields: 'id,name,created_at,line_items,financial_status',
  })

  return orders.flatMap(order =>
    order.line_items.map(item => ({
      Date: order.created_at.slice(0, 10),
      Order: order.name,
      Status: order.financial_status,
      SKU: item.sku || '—',
      Product: item.title,
      Variant: item.variant_title || '—',
      Qty: item.quantity,
      'Unit Price': `£${parseFloat(item.price).toFixed(2)}`,
      Total: `£${(parseFloat(item.price) * item.quantity).toFixed(2)}`,
    }))
  )
}
