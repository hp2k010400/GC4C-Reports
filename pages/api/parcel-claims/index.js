import { getSupabase } from '../../../lib/supabase'
import { isValidStage, isValidIssueType, isValidClaimStatus } from '../../../lib/parcelClaims'

const DEFAULT_LIMIT = 200

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  return res.status(405).json({ error: 'Method not allowed' })
}

// Scans the whole table (paginated past PostgREST's 1,000-row cap) and finds
// every raw email/eBay/name value that belongs to a customer with 2+ claims
// — deliberately ignores whatever filters are currently active, since "is
// this person a serial claimer" should look at their full history, not just
// what's on screen right now.
async function findRepeatCustomerValues(supabase) {
  const PAGE_SIZE = 1000
  let all = []
  let offset = 0
  while (true) {
    const { data: page, error } = await supabase
      .from('parcel_claims')
      .select('email, ebay_username, customer_name')
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    all = all.concat(page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const groups = new Map() // lowercased identity -> { count, values: Set of raw case variants }
  for (const r of all) {
    const raw = (r.email || r.ebay_username || r.customer_name || '').trim()
    if (!raw) continue
    const key = raw.toLowerCase()
    if (!groups.has(key)) groups.set(key, { count: 0, values: new Set() })
    const g = groups.get(key)
    g.count += 1
    g.values.add(raw)
  }

  const repeatValues = []
  for (const g of groups.values()) {
    if (g.count >= 2) repeatValues.push(...g.values)
  }
  return repeatValues
}

async function handleGet(req, res) {
  const { status, stage, courier, search, from, to, closed, repeatOnly, limit, offset } = req.query
  const supabase = getSupabase()

  let query = supabase.from('parcel_claims').select('*', { count: 'exact' })

  // Default view = open cases only, so the day-to-day list stays small even
  // with thousands of historical rows. `closed=1` (or any explicit
  // status/stage filter) overrides this.
  if (closed !== '1' && !status && !stage) {
    query = query.neq('stage', 'delivered_ok').not('claim_status', 'in', '(settled,denied)')
  }

  if (status) query = query.eq('claim_status', status)
  if (stage) query = query.eq('stage', stage)
  if (courier) query = query.eq('courier', courier)
  if (from) query = query.gte('date_started', from)
  if (to) query = query.lte('date_started', to)

  if (search && search.trim()) {
    // Strip characters that would break the PostgREST or-filter syntax.
    const q = search.trim().replace(/[,%()]/g, '')
    if (q) {
      query = query.or(
        `customer_name.ilike.%${q}%,email.ilike.%${q}%,ebay_username.ilike.%${q}%,consignment_ref.ilike.%${q}%,claim_ref.ilike.%${q}%`
      )
    }
  }

  if (repeatOnly === '1') {
    let repeatValues
    try {
      repeatValues = await findRepeatCustomerValues(supabase)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
    if (repeatValues.length === 0) {
      return res.status(200).json({ rows: [], total: 0 })
    }
    // Escape commas/parens so they can't break the or-filter list, then match
    // against whichever of the three fields the value actually came from.
    const escaped = repeatValues.map(v => v.replace(/[,()]/g, '')).filter(Boolean)
    const csv = escaped.map(v => `"${v}"`).join(',')
    query = query.or(`email.in.(${csv}),ebay_username.in.(${csv}),customer_name.in.(${csv})`)
  }

  const lim = Math.min(parseInt(limit, 10) || DEFAULT_LIMIT, 500)
  const off = parseInt(offset, 10) || 0
  // nullsFirst: false — rows with no date (mostly historical imports where the
  // sheet never had one) sort to the bottom instead of swamping the top.
  query = query.order('date_started', { ascending: false, nullsFirst: false }).range(off, off + lim - 1)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })

  res.status(200).json({ rows: data, total: count })
}

async function handlePost(req, res) {
  const body = req.body || {}
  if (!body.customer_name || !body.customer_name.trim()) {
    return res.status(400).json({ error: 'Customer name is required' })
  }
  if (body.stage && !isValidStage(body.stage)) {
    return res.status(400).json({ error: `Invalid stage: ${body.stage}` })
  }
  if (body.issue_type && !isValidIssueType(body.issue_type)) {
    return res.status(400).json({ error: `Invalid issue_type: ${body.issue_type}` })
  }
  if (body.claim_status && !isValidClaimStatus(body.claim_status)) {
    return res.status(400).json({ error: `Invalid claim_status: ${body.claim_status}` })
  }

  const row = {
    date_started: body.date_started || undefined,
    customer_name: body.customer_name.trim(),
    email: body.email?.trim() || null,
    ebay_username: body.ebay_username?.trim() || null,
    courier: body.courier?.trim() || 'DPD',
    consignment_ref: body.consignment_ref?.trim() || null,
    value_tier: body.value_tier?.trim() || null,
    retail: body.retail === '' || body.retail == null ? null : Number(body.retail),
    cost: body.cost === '' || body.cost == null ? null : Number(body.cost),
    claim_amount: body.claim_amount === '' || body.claim_amount == null ? null : Number(body.claim_amount),
    recovered_amount: body.recovered_amount === '' || body.recovered_amount == null ? null : Number(body.recovered_amount),
    weight_kg: body.weight_kg === '' || body.weight_kg == null ? null : Number(body.weight_kg),
    claim_ref: body.claim_ref?.trim() || null,
    stage: body.stage || 'investigating',
    issue_type: body.issue_type || null,
    claim_status: body.claim_status || 'not_applicable',
    notes: body.notes?.trim() || null,
    handled_by: body.handled_by?.trim() || null,
  }

  const supabase = getSupabase()
  const { data, error } = await supabase.from('parcel_claims').insert(row).select().single()
  if (error) return res.status(500).json({ error: error.message })

  res.status(200).json({ row: data })
}
