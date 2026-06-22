import { shopifyFetchPage } from '../../lib/shopify.js'

const FIELDS = 'id,name,created_at,total_price,email,source_name,customer,refunds,line_items'

async function fetchByStatus(financialStatus, startDate, endDate, locationId) {
  const orders = []
  let pageInfo = null
  do {
    const params = pageInfo
      ? { page_info: pageInfo }
      : {
          status: 'any',
          financial_status: financialStatus,
          created_at_min: new Date(startDate).toISOString(),
          created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
          fields: FIELDS,
          ...(locationId ? { location_id: locationId } : {}),
        }
    const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)
    orders.push(...items)
    pageInfo = nextPageInfo
  } while (pageInfo)
  return orders
}

export default async function handler(req, res) {
  const { startDate, endDate, location_id } = req.query
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' })
  }

  try {
    const [refunded, partialRefunded] = await Promise.all([
      fetchByStatus('refunded', startDate, endDate, location_id),
      fetchByStatus('partially_refunded', startDate, endDate, location_id),
    ])

    const customerMap = new Map()

    for (const order of [...refunded, ...partialRefunded]) {
      if (!order.refunds?.length) continue

      const email = (order.customer?.email || order.email || '').toLowerCase().trim()
      if (!email) continue

      const name = order.customer
        ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
        : ''

      if (!customerMap.has(email)) {
        customerMap.set(email, {
          email,
          name: name || email,
          customerId: order.customer?.id ? String(order.customer.id) : null,
          ordersWithReturns: 0,
          totalRefundCount: 0,
          totalRefunded: 0,
          grossSpend: 0,
          daysToReturnSum: 0,
          daysToReturnCount: 0,
          channels: new Set(),
          hasReturns: false,
          hasExchanges: false,
          firstReturn: null,
          lastReturn: null,
          returns: [],
        })
      }

      const c = customerMap.get(email)
      c.ordersWithReturns++
      c.grossSpend += parseFloat(order.total_price || 0)
      if (name && !c.name) c.name = name
      if (order.source_name) c.channels.add(order.source_name)

      // Detect exchange vs return by comparing refunded qty to total order qty
      const totalOrderQty = (order.line_items || []).reduce((s, li) => s + (li.quantity || 0), 0)

      for (const refund of order.refunds) {
        const refundDate = refund.created_at?.slice(0, 10) ?? ''
        const refundAmount = (refund.refund_line_items || []).reduce(
          (s, rli) => s + parseFloat(rli.subtotal || 0), 0
        )
        const refundedQty = (refund.refund_line_items || []).reduce((s, rli) => s + (rli.quantity || 0), 0)
        const eventType = refundedQty >= totalOrderQty ? 'return' : 'exchange'

        if (eventType === 'return') c.hasReturns = true
        else c.hasExchanges = true

        const orderDt = order.created_at ? new Date(order.created_at) : null
        const refundDt = refund.created_at ? new Date(refund.created_at) : null
        if (orderDt && refundDt) {
          c.daysToReturnSum += Math.max(0, Math.round((refundDt - orderDt) / 86400000))
          c.daysToReturnCount++
        }

        if (!c.firstReturn || refundDate < c.firstReturn) c.firstReturn = refundDate
        if (!c.lastReturn || refundDate > c.lastReturn) c.lastReturn = refundDate
        c.totalRefunded += refundAmount
        c.totalRefundCount++

        c.returns.push({
          order: order.name,
          orderId: order.id,
          orderDate: order.created_at?.slice(0, 10) ?? '',
          orderTotal: parseFloat(order.total_price || 0),
          refundDate,
          refundAmount: parseFloat(refundAmount.toFixed(2)),
          type: eventType,
          note: refund.note || '',
          channel: order.source_name || '',
          items: (refund.refund_line_items || []).map(rli => ({
            product: rli.line_item?.title || rli.line_item?.name || 'Unknown',
            variant: rli.line_item?.variant_title || '',
            sku: rli.line_item?.sku || '',
            qty: rli.quantity || 0,
            amount: parseFloat(rli.subtotal || 0),
          })),
        })
      }
    }

    const customers = Array.from(customerMap.values())
      .map(c => {
        const totalRefunded = parseFloat(c.totalRefunded.toFixed(2))
        const grossSpend = parseFloat(c.grossSpend.toFixed(2))
        const netSpend = parseFloat((grossSpend - totalRefunded).toFixed(2))
        return {
          email: c.email,
          name: c.name,
          customerId: c.customerId,
          ordersWithReturns: c.ordersWithReturns,
          totalRefundCount: c.totalRefundCount,
          totalRefunded,
          grossSpend,
          netSpend,
          avgDaysToReturn: c.daysToReturnCount > 0
            ? Math.round(c.daysToReturnSum / c.daysToReturnCount)
            : 0,
          channels: [...c.channels].sort(),
          hasReturns: c.hasReturns,
          hasExchanges: c.hasExchanges,
          firstReturn: c.firstReturn,
          lastReturn: c.lastReturn,
          returns: c.returns,
        }
      })
      .sort((a, b) => b.totalRefunded - a.totalRefunded)

    res.json({ customers, ordersScanned: refunded.length + partialRefunded.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
