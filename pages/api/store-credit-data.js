import { shopifyGraphQL } from '../../lib/shopify.js'

// Set PRO_CUSTOMER_TAG in Netlify env vars to match the exact tag used on pro/trade accounts.
// Comparison is case-insensitive. Customers with this tag are excluded from results.
const PRO_TAG = (process.env.PRO_CUSTOMER_TAG || 'trade account').toLowerCase()

const GIFT_CARDS_QUERY = `
  query GiftCards($cursor: String, $query: String!) {
    giftCards(first: 50, after: $cursor, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          initialValue { amount }
          balance { amount }
          createdAt
          note
          customer {
            id
            email
            firstName
            lastName
            tags
          }
          order {
            tags
          }
        }
      }
    }
  }
`

export default async function handler(req, res) {
  const { startDate, endDate } = req.query
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' })

  try {
    const queryStr = `created_at:>='${startDate}' created_at:<='${endDate}T23:59:59'`
    const cards = []
    let cursor = null
    let hasNext = true

    while (hasNext) {
      const data = await shopifyGraphQL(GIFT_CARDS_QUERY, { cursor, query: queryStr })
      const gc = data.giftCards
      for (const { node } of gc.edges) {
        // only include cards linked to a real customer (excludes gift cards sold as products)
        if (!node.customer) continue
        // exclude pro/trade accounts
        const tags = (node.customer.tags || []).map(t => t.toLowerCase())
        if (tags.some(t => t === PRO_TAG)) continue

        cards.push({
          id: node.id,
          initialValue: parseFloat(node.initialValue?.amount || 0),
          balance: parseFloat(node.balance?.amount || 0),
          createdAt: node.createdAt?.slice(0, 10) || '',
          note: node.note || '',
          store: ['Edinburgh', 'Milton Keynes', 'Southampton', 'Warrington'].find(s => (node.order?.tags || []).includes(s)) || null,
          customer: {
            id: node.customer.id,
            email: node.customer.email || '',
            name: `${node.customer.firstName || ''} ${node.customer.lastName || ''}`.trim() || node.customer.email || '',
          },
        })
      }
      hasNext = gc.pageInfo.hasNextPage
      cursor = gc.pageInfo.endCursor
    }

    const totalIssued = parseFloat(cards.reduce((s, c) => s + c.initialValue, 0).toFixed(2))
    const totalRemaining = parseFloat(cards.reduce((s, c) => s + c.balance, 0).toFixed(2))

    res.json({
      cards,
      summary: {
        count: cards.length,
        totalIssued,
        totalRemaining,
        totalUsed: parseFloat((totalIssued - totalRemaining).toFixed(2)),
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
