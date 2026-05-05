import { reports } from '../../../lib/reports/index.js'

export default async function handler(req, res) {
  const { slug, startDate, endDate } = req.query
  const report = reports[slug]

  if (!report) return res.status(404).json({ error: 'Report not found' })

  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured. Complete the Shopify app installation first.' })
  }

  try {
    const data = await report.fetch({ startDate, endDate })
    res.status(200).json({ data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
