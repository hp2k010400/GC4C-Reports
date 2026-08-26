import { shopifyFetchPage } from '../shopify.js'

export function buildSoldSkusParams({ pageInfo, startDate, endDate, sinceISO }) {
  if (pageInfo) return { page_info: pageInfo }
  // sinceISO is used to top up a stale cache with orders placed since it was
  // written — an exact timestamp, not a date-only string, so it can land
  // mid-day rather than only ever starting from midnight. See
  // deletion-candidates.js's fetchSoldSkus() cache-hit path.
  if (sinceISO) {
    return {
      status: 'any',
      fields: 'id,line_items',
      created_at_min: sinceISO,
      created_at_max: new Date().toISOString(),
      limit: 250,
    }
  }
  return {
    status: 'any',
    fields: 'id,line_items',
    created_at_min: new Date(startDate).toISOString(),
    created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
    limit: 250,
  }
}

export async function fetchSoldSkusPage(params) {
  const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)
  const skus = []
  for (const order of items) {
    for (const item of order.line_items || []) {
      if (item.sku) skus.push(String(item.sku).trim())
    }
  }
  return { skus, nextPageInfo }
}

// Loops until exhausted — only safe to call somewhere with a large execution
// budget (e.g. a scheduled function), not a page-triggered Netlify function.
export async function fetchAllSoldSkus(windowDays) {
  const startDate = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10)
  const endDate = new Date().toISOString().slice(0, 10)
  const skus = new Set()
  let pageInfo = null
  do {
    const params = buildSoldSkusParams({ pageInfo, startDate, endDate })
    const { skus: pageSkus, nextPageInfo: next } = await fetchSoldSkusPage(params)
    for (const sku of pageSkus) skus.add(sku)
    pageInfo = next
  } while (pageInfo)
  return [...skus]
}
