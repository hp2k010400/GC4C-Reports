import { getSupabase } from '../../../lib/supabase'
import { expectedShortfall } from '../../../lib/parcelClaims'

// Aggregates are computed here (server-side, over a lean column selection)
// rather than shipping all 5,000+ raw rows to the browser just to sum them —
// mirrors how pages/returns.js aggregates orders it already has in memory,
// just done on the server since this table is much bigger.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { status, stage, courier, from, to, search } = req.query
  const supabase = getSupabase()

  // Same optional filters as the list endpoint, so stats can reflect
  // "what's on screen right now" when the user has filters applied — but
  // with NO filters, stats stay all-time (not the default open-only list view).
  function buildQuery() {
    let q = supabase
      .from('parcel_claims')
      .select('cost, claim_amount, recovered_amount, weight_kg, stage, claim_status, courier, date_started')
    if (status) q = q.eq('claim_status', status)
    if (stage) q = q.eq('stage', stage)
    if (courier) q = q.eq('courier', courier)
    if (from) q = q.gte('date_started', from)
    if (to) q = q.lte('date_started', to)
    if (search && search.trim()) {
      const s = search.trim().replace(/[,%()]/g, '')
      if (s) {
        q = q.or(`customer_name.ilike.%${s}%,email.ilike.%${s}%,ebay_username.ilike.%${s}%,consignment_ref.ilike.%${s}%,claim_ref.ilike.%${s}%`)
      }
    }
    return q
  }

  // Supabase/PostgREST caps any single request at 1,000 rows regardless of
  // .range() — loop in 1,000-row pages until a page comes back short, or
  // this silently truncates every total once the table passes 1,000 rows.
  const PAGE_SIZE = 1000
  let data = []
  let offset = 0
  while (true) {
    const { data: page, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1)
    if (error) return res.status(500).json({ error: error.message })
    data = data.concat(page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  let openCostExposure = 0
  let totalClaimed = 0
  let totalRecovered = 0
  let totalDenied = 0
  let totalExpectedShortfall = 0
  const byCourier = {}

  // Running-total chart always spans the current calendar year, Jan-Dec,
  // resetting to zero each January — not an ever-growing total since 2021.
  const currentYear = new Date().getFullYear()
  const monthly = {} // { 'YYYY-MM': { cost: n, recovered: n } }
  for (let m = 1; m <= 12; m++) {
    const key = `${currentYear}-${String(m).padStart(2, '0')}`
    monthly[key] = { month: key, cost: 0, recovered: 0 }
  }

  for (const r of data) {
    const cost = Number(r.cost) || 0
    const claimAmount = r.claim_amount != null ? Number(r.claim_amount) : null
    // What actually got paid back — a dedicated field since DPD doesn't
    // always settle for the full claimed amount. Falls back to claim_amount
    // (then cost) for rows that predate this field.
    const recoveredValue = r.recovered_amount != null ? Number(r.recovered_amount) : (claimAmount != null ? claimAmount : cost)
    const isClosed = r.stage === 'delivered_ok' || ['settled', 'denied'].includes(r.claim_status)

    if (!isClosed) {
      openCostExposure += cost
      const shortfall = expectedShortfall(r)
      if (shortfall != null && shortfall > 0) totalExpectedShortfall += shortfall

      if (!byCourier[r.courier || 'Unknown']) byCourier[r.courier || 'Unknown'] = { courier: r.courier || 'Unknown', count: 0, cost: 0 }
      byCourier[r.courier || 'Unknown'].count += 1
      byCourier[r.courier || 'Unknown'].cost += cost
    }

    if (['form_sent', 'form_received'].includes(r.claim_status)) {
      totalClaimed += claimAmount != null ? claimAmount : cost
    }
    if (r.claim_status === 'settled') {
      totalRecovered += recoveredValue
    }
    if (r.claim_status === 'denied') {
      totalDenied += cost
    }

    const month = (r.date_started || '').slice(0, 7)
    if (month && monthly[month]) {
      monthly[month].cost += cost
      if (r.claim_status === 'settled') monthly[month].recovered += recoveredValue
    }
  }

  // Build a cumulative (running total) series for the chart, oldest first.
  const months = Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month))
  let runningCost = 0
  let runningRecovered = 0
  const series = months.map(m => {
    runningCost += m.cost
    runningRecovered += m.recovered
    return {
      month: m.month,
      cumulativeCost: parseFloat(runningCost.toFixed(2)),
      cumulativeRecovered: parseFloat(runningRecovered.toFixed(2)),
      netPosition: parseFloat((runningCost - runningRecovered).toFixed(2)),
    }
  })

  res.status(200).json({
    openCostExposure: parseFloat(openCostExposure.toFixed(2)),
    totalClaimed: parseFloat(totalClaimed.toFixed(2)),
    totalRecovered: parseFloat(totalRecovered.toFixed(2)),
    totalDenied: parseFloat(totalDenied.toFixed(2)),
    totalExpectedShortfall: parseFloat(totalExpectedShortfall.toFixed(2)),
    byCourier: Object.values(byCourier).sort((a, b) => b.cost - a.cost),
    series,
    totalRows: data.length,
  })
}
