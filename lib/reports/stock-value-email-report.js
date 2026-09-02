import { shopifyGraphQL } from '../shopify.js'
import { sendEmail, STOCK_VALUE_RECIPIENTS } from '../mailer.js'
import { STOCK_VALUE_QUERY, buildStockValueFilter } from './stock-value.js'

const fmtGbp = n =>
  `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Unbounded loop (no page-count cap) — same shape as fetchAllSoldSkus/
// fetchAllZeroStockProducts elsewhere in lib/reports/. Only safe to call
// from somewhere with a large execution budget (a scheduled/background
// function), never a page-triggered one — this is the same GraphQL query
// pages/api/stock-value.js already uses per-page, just run to exhaustion.
async function fetchAllStockValueRows() {
  const filter = buildStockValueFilter()
  let cursor = null
  let allRows = []
  do {
    const data = await shopifyGraphQL(STOCK_VALUE_QUERY, { filter, ...(cursor ? { cursor } : {}) })
    const page = data.products
    const rows = page.edges.flatMap(({ node: product }) =>
      product.variants.edges.flatMap(({ node: v }) => {
        const unitCost = parseFloat(v.inventoryItem?.unitCost?.amount || 0)
        const levels = v.inventoryItem?.inventoryLevels?.edges || []
        return levels
          .map(({ node: l }) => ({
            locationId: l.location?.legacyResourceId || '',
            location: l.location?.name || '',
            onHand: l.quantities?.[0]?.quantity ?? 0,
            unitCost,
          }))
          .filter(r => r.onHand > 0)
      })
    )
    allRows = allRows.concat(rows)
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (cursor)
  return allRows
}

function aggregate(rows) {
  const byLocation = new Map()
  let totalValue = 0
  let totalUnits = 0
  for (const r of rows) {
    const value = r.onHand * r.unitCost
    totalValue += value
    totalUnits += r.onHand
    const key = r.locationId || 'unknown'
    if (!byLocation.has(key)) byLocation.set(key, { name: r.location || 'Unknown', value: 0, units: 0 })
    const l = byLocation.get(key)
    l.value += value
    l.units += r.onHand
  }
  const perLocation = [...byLocation.values()].sort((a, b) => b.value - a.value)
  return { totalValue, totalUnits, perLocation }
}

function buildEmail({ totalValue, totalUnits, perLocation }, dateStr) {
  const rows = perLocation.map(l => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;">${l.name}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${l.units.toLocaleString()}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmtGbp(l.value)}</td>
  </tr>`).join('')

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>GC4C Stock Asset Value</title>
</head>
<body style="margin:0;padding:20px;background:#f4f5f7;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:#005F2C;padding:24px 28px;border-radius:8px 8px 0 0;">
    <div style="color:white;font-size:20px;font-weight:700;">Stock Asset Value</div>
    <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">${dateStr}</div>
  </div>
  <div style="background:white;padding:20px 28px;display:flex;gap:24px;">
    <div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#888;">Total Stock Value — all locations</div>
      <div style="font-size:26px;font-weight:700;color:#005F2C;margin-top:4px;">${fmtGbp(totalValue)}</div>
    </div>
    <div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#888;">Units On Hand</div>
      <div style="font-size:26px;font-weight:700;color:#333;margin-top:4px;">${totalUnits.toLocaleString()}</div>
    </div>
  </div>
  <div style="background:white;padding:0 28px 20px;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f7f7f8;">
          <th style="padding:8px 12px;text-align:left;">Location</th>
          <th style="padding:8px 12px;text-align:right;">Units</th>
          <th style="padding:8px 12px;text-align:right;">Value</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div style="background:#f0f0f0;padding:14px 28px;border-radius:0 0 8px 8px;font-size:11px;color:#999;">
    Automated monthly report from GC4C Reports — as of 1st of the month, 00:01 —
    <a href="https://gc4creportsandstock.netlify.app/stock-value" style="color:#005F2C;">View live dashboard</a>
    (run any time for the current figures — this email is a monthly snapshot).
  </div>
</div>
</body></html>`
}

export async function run({ testRecipient } = {}) {
  const rows = await fetchAllStockValueRows()
  const agg = aggregate(rows)
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const html = buildEmail(agg, dateStr)

  await sendEmail({
    to: testRecipient || STOCK_VALUE_RECIPIENTS,
    subject: `Stock Asset Value — ${dateStr}`,
    html,
  })

  return { totalValue: agg.totalValue, totalUnits: agg.totalUnits, locations: agg.perLocation.length }
}
