import { shopifyGraphQL } from '../../lib/shopify.js'

const PRO_TAG = (process.env.PRO_CUSTOMER_TAG || 'trade account').toLowerCase()

const GIFT_CARDS_QUERY = `
  query GiftCards($cursor: String, $query: String!) {
    giftCards(first: 50, after: $cursor, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          initialValue { amount }
          customer { tags }
          order { tags }
        }
      }
    }
  }
`

async function fetchGiftCards(startDate, endDate) {
  const queryStr = `created_at:>='${startDate}' created_at:<='${endDate}T23:59:59'`
  // byStore: { [storeName]: { count, total } }
  const byStore = {}
  let count = 0
  let total = 0
  let cursor = null
  let hasNext = true

  while (hasNext) {
    const data = await shopifyGraphQL(GIFT_CARDS_QUERY, { cursor, query: queryStr })
    const gc = data.giftCards
    for (const { node } of gc.edges) {
      if (!node.customer) continue
      const tags = (node.customer.tags || []).map(t => t.toLowerCase())
      if (tags.some(t => t === PRO_TAG)) continue
      const amount = parseFloat(node.initialValue?.amount || 0)
      const store = ['Edinburgh', 'Milton Keynes', 'Southampton', 'Warrington'].find(s => (node.order?.tags || []).includes(s)) || null
      count++
      total += amount
      if (store) {
        if (!byStore[store]) byStore[store] = { count: 0, total: 0 }
        byStore[store].count++
        byStore[store].total = parseFloat((byStore[store].total + amount).toFixed(2))
      }
    }
    hasNext = gc.pageInfo.hasNextPage
    cursor = gc.pageInfo.endCursor
  }

  return { count, total: parseFloat(total.toFixed(2)), byStore }
}

async function fetchFormSubmissions(startDate, endDate) {
  const url =
    `${process.env.SUPABASE_URL}/rest/v1/store_submissions` +
    `?select=store,transaction_type,payment_amount` +
    `&submitted_at=gte.${startDate}T00:00:00` +
    `&submitted_at=lte.${endDate}T23:59:59` +
    `&or=(status.is.null,status.neq.void)`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_KEY,
    },
  })
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`)
  return res.json()
}

export default async function handler(req, res) {
  const { startDate, endDate } = req.query
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' })

  try {
    const [rows, giftCards] = await Promise.all([
      fetchFormSubmissions(startDate, endDate),
      fetchGiftCards(startDate, endDate),
    ])

    // Aggregate payment form submissions by store and type
    const byStore = {}
    const byType = {}

    for (const row of rows) {
      const store = row.store || 'Unknown'
      const type = row.transaction_type || 'Unknown'
      const amount = parseFloat(row.payment_amount || 0)

      if (!byStore[store]) byStore[store] = {}
      if (!byStore[store][type]) byStore[store][type] = { count: 0, total: 0 }
      byStore[store][type].count++
      byStore[store][type].total = parseFloat((byStore[store][type].total + amount).toFixed(2))

      if (!byType[type]) byType[type] = { count: 0, total: 0 }
      byType[type].count++
      byType[type].total = parseFloat((byType[type].total + amount).toFixed(2))
    }

    // Merge gift card store breakdown into byStore
    for (const [store, sc] of Object.entries(giftCards.byStore)) {
      if (!byStore[store]) byStore[store] = {}
      byStore[store]['Store Credit'] = sc
    }

    byType['Store Credit'] = { count: giftCards.count, total: giftCards.total }

    const paidOutCount = rows.length
    const paidOutTotal = parseFloat(rows.reduce((s, r) => s + parseFloat(r.payment_amount || 0), 0).toFixed(2))
    const totalCount = paidOutCount + giftCards.count
    const storeCreditPct = totalCount > 0 ? parseFloat(((giftCards.count / totalCount) * 100).toFixed(1)) : 0

    res.json({
      global: {
        totalCount,
        paidOutCount,
        paidOutTotal,
        storeCreditCount: giftCards.count,
        storeCreditTotal: giftCards.total,
        storeCreditPct,
      },
      byStore,
      byType,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
