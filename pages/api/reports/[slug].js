import { shopifyFetchPage } from '../../../lib/shopify.js'
import { reports } from '../../../lib/reports/index.js'

export default async function handler(req, res) {
  const { slug, startDate, endDate, page_info, productType, vendor } = req.query
  const report = reports[slug]

  if (!report) return res.status(404).json({ error: 'Report not found' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })
  }

  try {
    const params = page_info
      ? { page_info }
      : report.apiParams({ startDate, endDate, productType, vendor })

    const { items, nextPageInfo } = await shopifyFetchPage(report.endpoint, report.key, params)
    const rows = report.transform(items)

    res.status(200).json({ rows, nextPageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
