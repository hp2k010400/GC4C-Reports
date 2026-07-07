import { shopifyFetchPage, shopifyGetOne } from '../../lib/shopify.js'

const STORE_NAMES = ['Edinburgh', 'Milton Keynes', 'Southampton', 'Warrington']

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const now = new Date()
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const today = now.toISOString().slice(0, 10)

  const locData = await shopifyGetOne('locations.json')
  const locations = (locData.locations || []).filter(l => STORE_NAMES.includes(l.name))
  const locById = {}
  for (const l of locations) locById[String(l.id)] = l.name

  // Fetch orders updated since start of month (captures recently refunded orders)
  const orders = []
  let pageInfo = null
  do {
    const params = pageInfo ? { page_info: pageInfo } : {
      status: 'any',
      fields: 'id,location_id,refunds',
      updated_at_min: new Date(mtdStart).toISOString(),
      limit: 250,
    }
    const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)
    orders.push(...items)
    pageInfo = nextPageInfo
  } while (pageInfo)

  const methodA = {}  // refund attributed to order's store
  const methodB = {}  // refund attributed to transaction's store
  for (const name of STORE_NAMES) { methodA[name] = 0; methodB[name] = 0 }

  let refundsFound = 0
  for (const order of orders) {
    const orderStore = locById[String(order.location_id)]
    for (const refund of (order.refunds || [])) {
      const d = (refund.processed_at || '').slice(0, 10)
      if (d < mtdStart || d > today) continue
      for (const tx of (refund.transactions || [])) {
        if (tx.kind !== 'refund' || tx.status !== 'success') continue
        refundsFound++
        const amount = parseFloat(tx.amount || 0)
        if (orderStore) methodA[orderStore] = parseFloat((methodA[orderStore] + amount).toFixed(2))
        const txStore = locById[String(tx.location_id)]
        if (txStore) methodB[txStore] = parseFloat((methodB[txStore] + amount).toFixed(2))
      }
    }
  }

  res.json({
    period: `${mtdStart} to ${today}`,
    ordersFetched: orders.length,
    refundTransactionsFound: refundsFound,
    methodA_orderLocation: methodA,
    methodB_transactionLocation: methodB,
  })
}
