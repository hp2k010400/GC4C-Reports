import { shopifyGraphQL } from '../shopify.js'
import { sendEmail, STOCK_VALUE_RECIPIENTS } from '../mailer.js'
import { STOCK_VALUE_QUERY, buildStockValueFilter } from './stock-value.js'

const fmtGbp = n =>
  `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// A full run is ~150+ pages against Shopify's API and took 905.5s end to end
// in a real timed test (2026-09-02) — that's already past Netlify's 900s
// (15 min) background function hard limit, so one single invocation isn't
// safe; it would get killed mid-run most months. Instead this fetches in
// time-boxed chunks and self-chains to a fresh invocation (fresh 15 min
// clock each time) via an HTTP call to its own background function, which
// Netlify acks near-instantly and runs independently after — same
// fire-and-forget shape already proven by how the trigger-*-background
// functions get invoked. Only the running aggregate (a few numbers + a
// small per-location map) is carried between chunks, never the raw rows,
// so state stays small enough to pass in a URL.
const CHUNK_BUDGET_MS = 8 * 60 * 1000 // 8 min/chunk — big safety margin under the 15 min cap

async function shopifyGraphQLWithRetry(query, variables, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      return await shopifyGraphQL(query, variables)
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, i)))
    }
  }
}

function emptyAccumulator() {
  return { totalValue: 0, totalUnits: 0, byLocation: {} }
}

function addRowsToAccumulator(acc, rows) {
  for (const r of rows) {
    const value = r.onHand * r.unitCost
    acc.totalValue += value
    acc.totalUnits += r.onHand
    const key = r.locationId || 'unknown'
    if (!acc.byLocation[key]) acc.byLocation[key] = { name: r.location || 'Unknown', value: 0, units: 0 }
    acc.byLocation[key].value += value
    acc.byLocation[key].units += r.onHand
  }
}

// Fetches pages until either the cursor is exhausted or the time budget for
// this chunk runs out — whichever comes first. Returns where it got to so
// the caller can decide whether to send the email now or chain a
// continuation.
export async function fetchStockValueChunk({ cursor = null, accumulator = emptyAccumulator(), budgetMs = CHUNK_BUDGET_MS } = {}) {
  const filter = buildStockValueFilter()
  const start = Date.now()
  let nextCursor = cursor

  do {
    const data = await shopifyGraphQLWithRetry(STOCK_VALUE_QUERY, { filter, ...(nextCursor ? { cursor: nextCursor } : {}) })
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
    addRowsToAccumulator(accumulator, rows)
    nextCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (nextCursor && (Date.now() - start) < budgetMs)

  return { done: !nextCursor, cursor: nextCursor, accumulator }
}

function buildEmail({ totalValue, totalUnits, byLocation }, dateStr) {
  const perLocation = Object.values(byLocation).sort((a, b) => b.value - a.value)
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

export async function sendStockValueEmail(accumulator, testRecipient) {
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const html = buildEmail(accumulator, dateStr)
  await sendEmail({
    to: testRecipient || STOCK_VALUE_RECIPIENTS,
    subject: `Stock Asset Value — ${dateStr}`,
    html,
  })
  return { totalValue: accumulator.totalValue, totalUnits: accumulator.totalUnits, locations: Object.keys(accumulator.byLocation).length }
}
