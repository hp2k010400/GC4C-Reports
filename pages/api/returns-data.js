import { shopifyFetchPage, shopifyGetOne } from '../../lib/shopify.js'

async function fetchByStatus(financialStatus, startDate, endDate) {
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
        }
    const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)
    orders.push(...items)
    pageInfo = nextPageInfo
  } while (pageInfo)
  return orders
}

// orders_count and total_spent are NOT in the embedded customer object on orders —
// must fetch from the Customers endpoint separately.
async function fetchCustomerDetails(customerIdSet) {
  const details = new Map()
  const ids = [...customerIdSet]
  const BATCH = 100
  // Run 5 requests in parallel per round to keep it fast
  for (let i = 0; i < ids.length; i += BATCH * 5) {
    const round = []
    for (let j = i; j < Math.min(i + BATCH * 5, ids.length); j += BATCH) {
      round.push(ids.slice(j, j + BATCH))
    }
    const results = await Promise.all(
      round.map(batch =>
        shopifyGetOne('customers.json', {
          ids: batch.join(','),
          fields: 'id,orders_count,total_spent',
          limit: 250,
        })
      )
    )
    for (const result of results) {
      for (const c of result.customers || []) {
        details.set(String(c.id), c)
      }
    }
  }
  return details
}

export default async function handler(req, res) {
  const { startDate, endDate } = req.query
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' })
  }

  try {
    const [refunded, partialRefunded] = await Promise.all([
      fetchByStatus('refunded', startDate, endDate),
      fetchByStatus('partially_refunded', startDate, endDate),
    ])

    const allOrders = [...refunded, ...partialRefunded]

    // Build a quick refund total per customer ID to prioritise who gets the detail lookup
    const refundByCustomer = new Map()
    for (const order of allOrders) {
      const id = order.customer?.id ? String(order.customer.id) : null
      if (!id) continue
      const refundTotal = (order.refunds || []).reduce(
        (s, r) => s + (r.refund_line_items || []).reduce((rs, rli) => rs + parseFloat(rli.subtotal || 0), 0), 0
      )
      refundByCustomer.set(id, (refundByCustomer.get(id) || 0) + refundTotal)
    }

    // Only look up customer details for top 500 by refund value — keeps the request fast
    const DETAIL_LIMIT = 500
    const topIds = [...refundByCustomer.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, DETAIL_LIMIT)
      .map(([id]) => id)

    const customerDetails = await fetchCustomerDetails(new Set(topIds))

    const customerMap = new Map()

    for (const order of allOrders) {
      if (!order.refunds?.length) continue

      const email = (order.customer?.email || order.email || '').toLowerCase().trim()
      if (!email) continue

      const name = order.customer
        ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
        : ''

      const customerId = order.customer?.id ? String(order.customer.id) : null
      const full = customerId ? customerDetails.get(customerId) : null

      if (!customerMap.has(email)) {
        customerMap.set(email, {
          email,
          name: name || email,
          customerId,
          lifetimeOrders: full?.orders_count || 0,
          totalSpent: parseFloat(full?.total_spent || 0),
          ordersWithReturns: 0,
          totalRefundCount: 0,
          totalRefunded: 0,
          daysToReturnSum: 0,
          daysToReturnCount: 0,
          firstReturn: null,
          lastReturn: null,
          returns: [],
        })
      }

      const c = customerMap.get(email)
      c.ordersWithReturns++
      if (name && !c.name) c.name = name

      if (full) {
        if ((full.orders_count || 0) > c.lifetimeOrders) c.lifetimeOrders = full.orders_count
        const spent = parseFloat(full.total_spent || 0)
        if (spent > c.totalSpent) c.totalSpent = spent
      }

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
        const returnRate = c.lifetimeOrders > 0
          ? parseFloat((c.ordersWithReturns / c.lifetimeOrders * 100).toFixed(1))
          : 0
        const avgDaysToReturn = c.daysToReturnCount > 0
          ? Math.round(c.daysToReturnSum / c.daysToReturnCount)
          : 0
        const netSpend = parseFloat((c.totalSpent - totalRefunded).toFixed(2))
        return {
          email: c.email,
          name: c.name,
          customerId: c.customerId,
          lifetimeOrders: c.lifetimeOrders,
          ordersWithReturns: c.ordersWithReturns,
          totalRefundCount: c.totalRefundCount,
          totalRefunded,
          returnRate,
          avgDaysToReturn,
          netSpend,
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
