import { schedule } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { fetchAllZeroStockProducts, buildZeroStockFilter } from '../../lib/reports/zero-stock-products.js'
import { fetchAllSoldSkus } from '../../lib/reports/sold-skus.js'

// Keeps Deletion Candidates' caches warm even if nobody opens the report for
// weeks. Runs nightly as a scheduled function, which gets a much longer
// execution budget than a page-triggered one, so it can fetch everything in
// a single unbounded pass instead of the paginated-per-request approach the
// report page itself has to use.
const CACHE_CHUNK_SIZE = 4000 // must match deletion-candidates.js
const SOLD_SKUS_WINDOW_DAYS = 90 // must match deletion-candidates.js's NINETY_DAYS_MS

async function warmProductsCache() {
  const store = getStore('gc4c-products')
  const rows = await fetchAllZeroStockProducts(buildZeroStockFilter())

  const totalChunks = Math.ceil(rows.length / CACHE_CHUNK_SIZE)
  for (let i = 0; i < totalChunks; i++) {
    const chunk = rows.slice(i * CACHE_CHUNK_SIZE, (i + 1) * CACHE_CHUNK_SIZE)
    await store.set(`active-chunk-${i}`, JSON.stringify({ rows: chunk }))
  }
  await store.set('active-meta', JSON.stringify({ totalChunks, count: rows.length, timestamp: Date.now() }))

  return rows.length
}

async function warmSoldSkusCache() {
  const store = getStore('gc4c-sold-skus')
  const skus = await fetchAllSoldSkus(SOLD_SKUS_WINDOW_DAYS)
  await store.set('sold-skus', JSON.stringify({ skus, timestamp: Date.now() }))
  return skus.length
}

const runWarmup = async () => {
  const results = {}

  try {
    results.products = { ok: true, count: await warmProductsCache() }
  } catch (err) {
    results.products = { ok: false, error: err.message }
  }

  try {
    results.soldSkus = { ok: true, count: await warmSoldSkusCache() }
  } catch (err) {
    results.soldSkus = { ok: false, error: err.message }
  }

  console.log('warm-caches result:', JSON.stringify(results))
  return { statusCode: 200, body: JSON.stringify(results) }
}

// Runs every night at 3am UTC.
export const handler = schedule('0 3 * * *', runWarmup)
