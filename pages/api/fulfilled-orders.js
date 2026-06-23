import { shopifyFetchPage } from '../../lib/shopify.js'

export default async function handler(req, res) {
  const { startDate, endDate } = req.query

  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })
  }

  try {
    let allOrders = []
    let currentPageInfo = null
    let pagesCount = 0

    do {
      const params = currentPageInfo
        ? { page_info: currentPageInfo }
        : {
            status: 'any',
            fulfillment_status: 'fulfilled',
            fields: 'id,created_at,fulfillments',
            created_at_min: new Date(startDate).toISOString(),
            created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
            limit: 250,
          }

      const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)
      allOrders = allOrders.concat(items)
      currentPageInfo = nextPageInfo
      pagesCount++
    } while (currentPageInfo && pagesCount < 20)

    // Group by userId + date
    const counts = {} // { userId: { date: count } }
    for (const order of allOrders) {
      const date = order.created_at.slice(0, 10)
      const userId = String(order.fulfillments?.[0]?.user_id ?? 'unknown')
      if (!counts[userId]) counts[userId] = {}
      counts[userId][date] = (counts[userId][date] || 0) + 1
    }

    const rows = []
    for (const [userId, dateCounts] of Object.entries(counts)) {
      for (const [date, count] of Object.entries(dateCounts)) {
        rows.push({ userId, date, count })
      }
    }

    rows.sort((a, b) => b.date.localeCompare(a.date) || a.userId.localeCompare(b.userId))

    res.status(200).json({ rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
