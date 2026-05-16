import { shopifyFetchPage } from '../../lib/shopify.js'

const PAGES_PER_CALL = 5

export default async function handler(req, res) {
  const { page_info, startDate, endDate, financial_status, fulfillment_status, location_id, mode } = req.query
  const combined = mode === 'combined'

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
            status: 'any',
            fields: combined
              ? 'id,name,created_at,line_items'
              : 'id,name,created_at,financial_status,fulfillment_status,customer,line_items,tags,source_name,total_price,total_discounts,discount_codes',
            created_at_min: new Date(startDate).toISOString(),
            created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
            ...(financial_status   ? { financial_status }   : {}),
            ...(fulfillment_status ? { fulfillment_status } : {}),
            ...(location_id        ? { location_id }        : {}),
            limit: 250,
          }

      const { items, nextPageInfo: next } = await shopifyFetchPage('orders.json', 'orders', params)

      const rows = combined
        ? items.flatMap(order =>
            order.line_items.map(item => ({
              'Order':      order.name,
              'Date':       order.created_at.slice(0, 10),
              'SKU':        item.sku || '',
              'Qty':        item.quantity,
              'Line Total': (parseFloat(item.price) * item.quantity).toFixed(2),
            }))
          )
        : items.flatMap(order =>
            order.line_items.map(item => ({
              'Order':              order.name,
              'Date':               order.created_at.slice(0, 10),
              'Financial Status':   order.financial_status,
              'Fulfillment Status': order.fulfillment_status || 'unfulfilled',
              'Customer':           order.customer
                ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
                : '',
              'Email':              order.customer?.email || '',
              'SKU':                item.sku || '',
              'Product':            item.title,
              'Variant':            item.variant_title || '',
              'Variant ID':         item.variant_id || '',
              'Qty':                item.quantity,
              'Unit Price':         parseFloat(item.price).toFixed(2),
              'Line Total':         (parseFloat(item.price) * item.quantity).toFixed(2),
              'Order Total':        parseFloat(order.total_price).toFixed(2),
              'Discount':           parseFloat(order.total_discounts || 0).toFixed(2),
              'Discount Code':      (order.discount_codes || []).map(d => d.code).join(', '),
              'Tags':               order.tags || '',
              'Channel':            order.source_name || '',
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
