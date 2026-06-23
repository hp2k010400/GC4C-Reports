import { shopifyFetchPage } from '../../lib/shopify.js'

export default async function handler(req, res) {
  const { startDate, endDate } = req.query

  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })
  }

  try {
    let allEvents = []
    let currentPageInfo = null
    let pagesCount = 0

    do {
      const params = currentPageInfo
        ? { page_info: currentPageInfo }
        : {
            verb: 'fulfilled',
            subject_type: 'Order',
            created_at_min: new Date(startDate).toISOString(),
            created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
            limit: 250,
          }

      const { items, nextPageInfo } = await shopifyFetchPage('events.json', 'events', params)
      allEvents = allEvents.concat(items)
      currentPageInfo = nextPageInfo
      pagesCount++
    } while (currentPageInfo && pagesCount < 20)

    // Group by author + date, counting unique order IDs
    const staffDates = {}
    for (const event of allEvents) {
      const author = event.author
      if (!author || author.toLowerCase() === 'shopify') continue
      const date = event.created_at.slice(0, 10)
      const orderId = String(event.subject_id)
      if (!staffDates[author]) staffDates[author] = {}
      if (!staffDates[author][date]) staffDates[author][date] = new Set()
      staffDates[author][date].add(orderId)
    }

    const rows = []
    for (const [author, dates] of Object.entries(staffDates)) {
      for (const [date, orderIds] of Object.entries(dates)) {
        rows.push({ author, date, count: orderIds.size })
      }
    }

    rows.sort((a, b) => b.date.localeCompare(a.date) || a.author.localeCompare(b.author))
    res.status(200).json({ rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
