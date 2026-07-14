import { fetchSoldSkusPage, buildSoldSkusParams } from '../../lib/reports/sold-skus.js'

// Fetch 7 Shopify pages per Netlify call (7 × 250 = 1750 orders).
// Each Shopify call ~500-700ms so 7 pages ≈ 4-5s, safely within Netlify's 10s limit.
// Reduces client↔server round trips ~7x vs fetching one page at a time.
//
// No in-function retry here on purpose: retrying with backoff *inside* one
// invocation risks the sleep time alone pushing past Netlify's 10s limit,
// which caused hard-to-reproduce failures deep into long runs. Instead this
// throws immediately on a transient error and the client (deletion-candidates.js)
// retries the same page as a fresh function call with its own full time budget.
const PAGES_PER_CALL = 7

export default async function handler(req, res) {
  const { page_info, startDate, endDate } = req.query

  try {
    const skus = []
    let currentPageInfo = page_info || null
    let nextPageInfo = null
    let pagesCount = 0

    do {
      const params = buildSoldSkusParams({ pageInfo: currentPageInfo, startDate, endDate })
      const { skus: pageSkus, nextPageInfo: next } = await fetchSoldSkusPage(params)

      skus.push(...pageSkus)

      currentPageInfo = next
      nextPageInfo = next
      pagesCount++
    } while (currentPageInfo && pagesCount < PAGES_PER_CALL)

    res.status(200).json({ skus, nextPageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
