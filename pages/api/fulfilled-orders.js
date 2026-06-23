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
            fields: 'id,created_at',
            created_at_min: new Date(startDate).toISOString(),
            created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
            limit: 250,
          }

      const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)
      allOrders = allOrders.concat(items)
      currentPageInfo = nextPageInfo
      pagesCount++
    } while (currentPageInfo && pagesCount < 20)

    const countsByDate = {}
    for (const order of allOrders) {
      const date = order.created_at.slice(0, 10)
      countsByDate[date] = (countsByDate[date] || 0) + 1
    }

    const rows = Object.entries(countsByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date))

    res.status(200).json({ rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
