import { shopifyFetchPage } from '../../lib/shopify.js'

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
          ...(locationId ? { location_id: locationId } : {}),
        }
    const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)
    orders.push(...items)
    pageInfo = nextPageInfo
  } while (pageInfo)
  return orders
}

// Minimal fields fetch for all orders — just enough to count orders and sum spend per customer
async function fetchAllOrders(startDate, endDate, locationId) {
  const orders = []
  let pageInfo = null
  do {
    const params = pageInfo
      ? { page_info: pageInfo }
      : {
          status: 'any',
          created_at_min: new Date(startDate).toISOString(),
          created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
          fields: 'id,email,customer,total_price',
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
    // Run all three fetches in parallel
    const [refunded, partialRefunded, allOrders] = await Promise.all([
      fetchByStatus('refunded', startDate, endDate, location_id),
      fetchByStatus('partially_refunded', startDate, endDate, location_id),
      fetchAllOrders(startDate, endDate, location_id),
    ])

    // Per-customer period stats from ALL orders
    const periodStats = new Map()
    for (const order of allOrders) {
      const email = (order.customer?.email || order.email || '').toLowerCase().trim()
      if (!email) continue
      if (!periodStats.has(email)) periodStats.set(email, { totalOrders: 0, grossSpend: 0 })
      const s = periodStats.get(email)
      s.totalOrders++
      s.grossSpend += parseFloat(order.total_price || 0)
    }

    // Build customer map from refunded orders
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
          daysToReturnSum: 0,
          daysToReturnCount: 0,
          channels: new Set(),
          firstReturn: null,
          lastReturn: null,
          returns: [],
        })
      }

      const c = customerMap.get(email)
      c.ordersWithReturns++
      if (name && !c.name) c.name = name
      if (order.source_name) c.channels.add(order.source_name)

      for (const refund of order.refunds) {
        const refundDate = refund.created_at?.slice(0, 10) ?? ''
        const refundAmount = (refund.refund_line_items || []).reduce(
          (s, rli) => s + parseFloat(rli.subtotal || 0), 0
        )

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
        const period = periodStats.get(c.email)
        const totalOrdersInPeriod = period?.totalOrders || 0
        const grossSpendInPeriod = parseFloat((period?.grossSpend || 0).toFixed(2))
        const netSpendInPeriod = parseFloat((grossSpendInPeriod - totalRefunded).toFixed(2))
        const periodReturnRate = totalOrdersInPeriod > 0
          ? parseFloat((c.ordersWithReturns / totalOrdersInPeriod * 100).toFixed(1))
          : 0
        return {
          email: c.email,
          name: c.name,
          customerId: c.customerId,
          totalOrdersInPeriod,
          ordersWithReturns: c.ordersWithReturns,
          totalRefundCount: c.totalRefundCount,
          totalRefunded,
          grossSpendInPeriod,
          netSpendInPeriod,
          periodReturnRate,
          avgDaysToReturn: c.daysToReturnCount > 0
            ? Math.round(c.daysToReturnSum / c.daysToReturnCount)
            : 0,
          channels: [...c.channels].sort(),
          firstReturn: c.firstReturn,
          lastReturn: c.lastReturn,
          returns: c.returns,
        }
      })
      .sort((a, b) => b.totalRefunded - a.totalRefunded)

    res.json({ customers, ordersScanned: allOrders.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
