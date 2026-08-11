import { getSupabase } from '../../../lib/supabase'
import { expectedShortfall } from '../../../lib/parcelClaims'

// Aggregates are computed here (server-side, over a lean column selection)
// rather than shipping all 5,000+ raw rows to the browser just to sum them —
// mirrors how pages/returns.js aggregates orders it already has in memory,
// just done on the server since this table is much bigger.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('parcel_claims')
    .select('cost, claim_amount, weight_kg, stage, claim_status, courier, date_started')
    .range(0, 19999)

  if (error) return res.status(500).json({ error: error.message })

  let openCostExposure = 0
  let totalClaimed = 0
  let totalRecovered = 0
  let totalDenied = 0
  let totalExpectedShortfall = 0
  const byCourier = {}
  const monthly = {} // { 'YYYY-MM': { cost: n, recovered: n } }

  for (const r of data) {
    const cost = Number(r.cost) || 0
    const claimAmount = r.claim_amount != null ? Number(r.claim_amount) : null
    const recoveredValue = claimAmount != null ? claimAmount : cost
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
    if (month) {
      if (!monthly[month]) monthly[month] = { month, cost: 0, recovered: 0 }
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
