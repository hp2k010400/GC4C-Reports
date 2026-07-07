import { shopifyFetchPage, shopifyGetOne } from '../../lib/shopify.js'

const STORE_NAMES = ['Edinburgh', 'Milton Keynes', 'Southampton', 'Warrington']

async function fetchByStatus(status, updatedMin) {
  const orders = []
  let pageInfo = null
  do {
    const params = pageInfo ? { page_info: pageInfo } : {
      status: 'any',
      financial_status: status,
      fields: 'id,location_id,refunds',
      updated_at_min: updatedMin,
      limit: 250,
    }
    const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)
    orders.push(...items)
    pageInfo = nextPageInfo
  } while (pageInfo)
  return orders
}

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const now = new Date()
    const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const today = now.toISOString().slice(0, 10)
    const updatedMin = new Date(mtdStart).toISOString()

    const locData = await shopifyGetOne('locations.json')
    const locations = (locData.locations || []).filter(l => STORE_NAMES.includes(l.name))
    const locById = {}
    for (const l of locations) locById[String(l.id)] = l.name

    const [refunded, partial] = await Promise.all([
      fetchByStatus('refunded', updatedMin),
      fetchByStatus('partially_refunded', updatedMin),
    ])
    const allOrders = [...refunded, ...partial]

    const methodA = {}
    const methodB = {}
    for (const name of STORE_NAMES) { methodA[name] = 0; methodB[name] = 0 }

    let txCount = 0
    for (const order of allOrders) {
      const orderStore = locById[String(order.location_id)]
      for (const refund of (order.refunds || [])) {
        const d = (refund.processed_at || '').slice(0, 10)
        if (d < mtdStart || d > today) continue
        for (const tx of (refund.transactions || [])) {
          if (tx.kind !== 'refund' || tx.status !== 'success') continue
          txCount++
          const amount = parseFloat(tx.amount || 0)
          if (orderStore) methodA[orderStore] += amount
          const txStore = locById[String(tx.location_id)]
          if (txStore) methodB[txStore] += amount
        }
      }
    }

    for (const name of STORE_NAMES) {
      methodA[name] = parseFloat(methodA[name].toFixed(2))
      methodB[name] = parseFloat(methodB[name].toFixed(2))
    }

    res.json({
      period: `${mtdStart} to ${today}`,
      ordersFetched: allOrders.length,
      refundTxFound: txCount,
      methodA_orderLocation: methodA,
      methodB_transactionLocation: methodB,
    })
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack })
  }
}
