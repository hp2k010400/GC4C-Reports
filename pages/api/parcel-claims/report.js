import { getSupabase } from '../../../lib/supabase'

// Powers the "Report" view on the Missing Parcels page — replaces the old
// sheet's "Missing Parcels Calc" pivot tabs (Monthly Cost/HV-LV/Courier
// Summary) with the same breakdowns, selectable by day/week/month.
// Collapses the sheet's many typo'd/one-off courier spellings ("DPD(WAR)",
// "DPD/ Aramex", stray phone numbers typed into the wrong column, etc.) into
// the small clean set the old Calc tab actually showed columns for.
function normalizeCourier(raw) {
  if (!raw || !raw.trim()) return '(blank)'
  const s = raw.trim().toLowerCase()
  if (s.includes('dpd')) return 'DPD'
  if (s.includes('fedex')) return 'FedEx'
  if (s.includes('ups')) return 'UPS'
  if (s.includes('royal mail')) return 'Royal Mail'
  if (s.includes('hermes') || s.includes('evri')) return 'Evri'
  return 'Other'
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const granularity = ['day', 'week', 'month'].includes(req.query.granularity) ? req.query.granularity : 'month'
  const supabase = getSupabase()

  // Matches the old sheet's Calc tab, which only ever covered the current
  // year — not full history back to 2021.
  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear}-01-01`
  const yearEnd = `${currentYear}-12-31`

  // Same 1,000-row PostgREST cap applies here as everywhere else — page through.
  const PAGE_SIZE = 1000
  let data = []
  let offset = 0
  while (true) {
    const { data: page, error } = await supabase
      .from('parcel_claims')
      .select('date_started, cost, claim_amount, courier, value_tier, stage, claim_status')
      .gte('date_started', yearStart)
      .lte('date_started', yearEnd)
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) return res.status(500).json({ error: error.message })
    data = data.concat(page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  function periodKey(dateStr) {
    if (!dateStr) return null
    const d = new Date(dateStr + 'T00:00:00Z')
    if (granularity === 'month') return dateStr.slice(0, 7)
    if (granularity === 'day') return dateStr
    // week: Monday-start ISO week
    const day = d.getUTCDay() || 7
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - day + 1)
    return monday.toISOString().slice(0, 10)
  }

  const periods = {}
  const courierSet = new Set()

  function blank() {
    return {
      cost: 0, claimAmount: 0, count: 0,
      hv: 0, lv: 0, otherValueTier: 0,
      byCourier: {},
      byStage: {}, byClaimStatus: {},
    }
  }

  let noDate = blank()
  let noDateCount = 0

  for (const r of data) {
    const key = periodKey(r.date_started)
    const bucket = key ? (periods[key] || (periods[key] = blank())) : noDate
    if (!key) noDateCount++

    bucket.count += 1
    bucket.cost += Number(r.cost) || 0
    bucket.claimAmount += Number(r.claim_amount) || 0

    const vt = (r.value_tier || '').toUpperCase()
    if (vt === 'HV') bucket.hv += 1
    else if (vt === 'LV') bucket.lv += 1
    else if (vt) bucket.otherValueTier += 1

    const courier = normalizeCourier(r.courier)
    courierSet.add(courier)
    bucket.byCourier[courier] = (bucket.byCourier[courier] || 0) + 1

    bucket.byStage[r.stage] = (bucket.byStage[r.stage] || 0) + 1
    bucket.byClaimStatus[r.claim_status] = (bucket.byClaimStatus[r.claim_status] || 0) + 1
  }

  const sortedKeys = Object.keys(periods).sort()
  const rows = sortedKeys.map(key => ({ period: key, ...periods[key] }))

  // Grand total row, same shape as a period row
  const grand = blank()
  for (const row of rows) {
    grand.cost += row.cost
    grand.claimAmount += row.claimAmount
    grand.count += row.count
    grand.hv += row.hv
    grand.lv += row.lv
    grand.otherValueTier += row.otherValueTier
    for (const [c, n] of Object.entries(row.byCourier)) grand.byCourier[c] = (grand.byCourier[c] || 0) + n
    for (const [s, n] of Object.entries(row.byStage)) grand.byStage[s] = (grand.byStage[s] || 0) + n
    for (const [s, n] of Object.entries(row.byClaimStatus)) grand.byClaimStatus[s] = (grand.byClaimStatus[s] || 0) + n
  }

  const courierOrder = ['DPD', 'FedEx', 'UPS', 'Royal Mail', 'Evri', 'Other', '(blank)']
  const couriers = [...courierSet].sort((a, b) => courierOrder.indexOf(a) - courierOrder.indexOf(b))

  res.status(200).json({
    granularity,
    rows,
    grand,
    couriers,
    noDateCount,
  })
}
