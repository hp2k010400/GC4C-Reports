import { shopifyFetchPage } from '../../../lib/shopify.js'
import { reports } from '../../../lib/reports/index.js'
import { TYPE_GROUPS } from '../../../lib/typeGroups.js'

export default async function handler(req, res) {
  const { slug, startDate, endDate, page_info, productType } = req.query
  const report = reports[slug]

  if (!report) return res.status(404).json({ error: 'Report not found' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })
  }

  try {
    // Type filter selected: fetch all Shopify variants for that group server-side
    if (productType && report.supportsTypeFilter && !page_info) {
      const variants = TYPE_GROUPS[productType] || [productType]
      let allItems = []

      for (const variant of variants) {
        const baseParams = report.apiParams({ startDate, endDate, productType: variant })
        let variantPageInfo = null
        do {
          const params = variantPageInfo ? { page_info: variantPageInfo } : baseParams
          const { items, nextPageInfo } = await shopifyFetchPage(report.endpoint, report.key, params)
          allItems = allItems.concat(items)
          variantPageInfo = nextPageInfo
        } while (variantPageInfo)
      }

      const rows = report.transform(allItems)
      return res.status(200).json({ rows, nextPageInfo: null })
    }

    // No filter or paginating all-types: existing single-page cursor behaviour
    const params = page_info
      ? { page_info }
      : report.apiParams({ startDate, endDate, productType })

    const { items, nextPageInfo } = await shopifyFetchPage(report.endpoint, report.key, params)
    const rows = report.transform(items)

    res.status(200).json({ rows, nextPageInfo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
