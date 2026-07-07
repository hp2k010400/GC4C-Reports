import { shopifyFetchPage, shopifyGetOne } from '../../lib/shopify.js'

const STORE_NAMES = ['Edinburgh', 'Milton Keynes', 'Southampton', 'Warrington']

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const now = new Date()
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const today = now.toISOString().slice(0, 10)

  const lookback = new Date(mtdStart)
  lookback.setDate(lookback.getDate() - 90)

  const locData = await shopifyGetOne('locations.json')
  const locations = (locData.locations || []).filter(l => STORE_NAMES.includes(l.name))
  const locById = {}
  const locByName = {}
  for (const l of locations) {
    locById[String(l.id)] = l.name
    locByName[l.name] = l.id
  }

  // Method A: refunds on orders placed at each store (current approach)
  const methodA = {}
  for (const loc of locations) {
    let total = 0
    for (const fs of ['refunded', 'partially_refunded']) {
      let pageInfo = null
      do {
        const params = pageInfo ? { page_info: pageInfo } : {
          status: 'any', financial_status: fs,
          fields: 'id,refunds',
          created_at_min: lookback.toISOString(),
          location_id: String(loc.id), limit: 250,
        }
        const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)
        for (const order of items) {
          for (const refund of (order.refunds || [])) {
            const d = (refund.processed_at || '').slice(0, 10)
            if (d < mtdStart || d > today) continue
            for (const tx of (refund.transactions || [])) {
              if (tx.kind === 'refund' && tx.status === 'success') total += parseFloat(tx.amount || 0)
            }
          }
        }
        pageInfo = nextPageInfo
      } while (pageInfo)
    }
    methodA[loc.name] = parseFloat(total.toFixed(2))
  }

  // Method B: all refunded orders, attribute by transaction location_id
  const methodB = {}
  for (const name of STORE_NAMES) methodB[name] = 0

  for (const fs of ['refunded', 'partially_refunded']) {
    let pageInfo = null
    do {
      const params = pageInfo ? { page_info: pageInfo } : {
        status: 'any', financial_status: fs,
        fields: 'id,refunds',
        created_at_min: lookback.toISOString(),
        limit: 250,
      }
      const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)
      for (const order of items) {
        for (const refund of (order.refunds || [])) {
          const d = (refund.processed_at || '').slice(0, 10)
          if (d < mtdStart || d > today) continue
          for (const tx of (refund.transactions || [])) {
            if (tx.kind !== 'refund' || tx.status !== 'success') continue
            const storeName = locById[String(tx.location_id)]
            if (storeName) methodB[storeName] = parseFloat((methodB[storeName] + parseFloat(tx.amount || 0)).toFixed(2))
          }
        }
      }
      pageInfo = nextPageInfo
    } while (pageInfo)
  }

  res.json({ period: `${mtdStart} to ${today}`, methodA, methodB })
}
