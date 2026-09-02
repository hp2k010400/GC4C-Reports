import { schedule } from '@netlify/functions'
import { run } from '../../lib/reports/stock-value-email-report.js'

// Netlify's own native scheduler, not a GitHub Actions cron — deliberately.
// The old Matrixify-based version of this report queued behind every other
// scheduled Matrixify report, so it stopped actually starting at 00:01 (per
// Neil Rosie 2026-09-02 — needs to be accurate for finance/audit). GitHub
// Actions cron shares a global queue across every workflow on GitHub too and
// can suffer the same drift, so this uses Netlify's own scheduler instead,
// which only ever runs this one job — nothing else can queue in front of it.
// Also gets the long execution budget scheduled functions have, which a
// regular page-triggered API route wouldn't for a full unbounded catalog
// fetch (see fetchAllStockValueRows in stock-value-email-report.js).
const runMonthlyStockValueEmail = async () => {
  try {
    const result = await run()
    console.log('Stock Value email sent successfully:', JSON.stringify(result))
  } catch (err) {
    console.error('Stock Value email failed:', err)
  }
  return { statusCode: 200 }
}

export const handler = schedule('1 0 1 * *', runMonthlyStockValueEmail)
