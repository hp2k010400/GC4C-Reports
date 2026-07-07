import { shopifyFetchPage, shopifyGetOne } from './shopify.js'
import { sendEmail, REPORT_RECIPIENTS } from './mailer.js'

function staffFromTags(tags) {
  if (!tags) return null
  const arr = typeof tags === 'string' ? tags.split(',') : tags
  const t = arr.find(t => t.trim().toLowerCase().startsWith('staff:'))
  return t ? t.trim().slice(6).trim() : null
}

const STORE_ORDER = ['Edinburgh', 'Milton Keynes', 'Southampton', 'Warrington']

const fmtGbp = n =>
  `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = d =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function getLastWeekDates() {
  const now = new Date()
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1
  const thisMonday = new Date(now.getTime() - dow * 86400000)
  const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000)
  const lastSunday = new Date(thisMonday.getTime() - 86400000)
  return {
    startDate: lastMonday.toISOString().slice(0, 10),
    endDate: lastSunday.toISOString().slice(0, 10),
    label: `${fmtDate(lastMonday)} – ${fmtDate(lastSunday)}`,
  }
}

async function loadGripVariantIds() {
  const ids = new Set()
  for (const type of ['Golf Club Grips', 'Golf club grips']) {
    let pageInfo = null
    do {
      const params = pageInfo
        ? { page_info: pageInfo }
        : { product_type: type, limit: 250, fields: 'id,variants' }
      const { items, nextPageInfo } = await shopifyFetchPage('products.json', 'products', params)
      for (const p of items) {
        for (const v of (p.variants || [])) ids.add(v.id)
      }
      pageInfo = nextPageInfo
    } while (pageInfo)
  }
  return ids
}

async function fetchGripData(startDate, endDate) {
  const [gripIds, locData, usersData] = await Promise.all([
    loadGripVariantIds(),
    shopifyGetOne('locations.json'),
    shopifyGetOne('users.json').catch(() => ({ users: [] })),
  ])

  const users = {}
  for (const u of (usersData.users || [])) {
    users[String(u.id)] = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || String(u.id)
  }

  const locations = (locData.locations || []).filter(l => STORE_ORDER.includes(l.name))

  let accPosQty = 0, accPosRevenue = 0, accGripQty = 0, accGripRevenue = 0
  const accByStore = {}
  const accByUser = {}

  for (const loc of locations) {
    let pageInfo = null
    do {
      const params = pageInfo ? { page_info: pageInfo } : {
        status: 'any',
        fields: 'id,name,created_at,line_items,user_id,tags',
        created_at_min: new Date(startDate).toISOString(),
        created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
        location_id: String(loc.id),
        limit: 250,
      }
      const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)

      for (const order of items) {
        const staffName = staffFromTags(order.tags) || users[String(order.user_id)] || null
        const userId = staffName || String(order.user_id || 'unknown')
        if (!accByUser[userId]) accByUser[userId] = { totalOrders: 0, gripOrders: 0, gripQty: 0, gripRevenue: 0 }
        accByUser[userId].totalOrders++
        if (!accByStore[loc.name]) accByStore[loc.name] = { posQty: 0, posRevenue: 0, gripQty: 0, gripRevenue: 0 }

        let orderHasGrip = false
        for (const item of (order.line_items || [])) {
          const qty = item.quantity
          const price = parseFloat(item.price || 0)
          const lineTotal = qty * price
          const isGrip = gripIds.has(item.variant_id)

          accPosQty += qty
          accPosRevenue += lineTotal
          accByStore[loc.name].posQty += qty
          accByStore[loc.name].posRevenue += lineTotal

          if (isGrip) {
            accGripQty += qty
            accGripRevenue += lineTotal
            orderHasGrip = true
            accByStore[loc.name].gripQty += qty
            accByStore[loc.name].gripRevenue += lineTotal
            accByUser[userId].gripQty += qty
            accByUser[userId].gripRevenue += lineTotal
          }
        }
        if (orderHasGrip) accByUser[userId].gripOrders++
      }
      pageInfo = nextPageInfo
    } while (pageInfo)
  }

  const byStore = STORE_ORDER.filter(s => accByStore[s]).map(store => {
    const d = accByStore[store]
    return {
      store,
      gripQty: d.gripQty,
      gripRevenue: parseFloat(d.gripRevenue.toFixed(2)),
      posQty: d.posQty,
      posRevenue: parseFloat(d.posRevenue.toFixed(2)),
      pctQty: d.posQty > 0 ? parseFloat(((d.gripQty / d.posQty) * 100).toFixed(1)) : 0,
      pctRevenue: d.posRevenue > 0 ? parseFloat(((d.gripRevenue / d.posRevenue) * 100).toFixed(1)) : 0,
    }
  })

  const byColleague = Object.entries(accByUser)
    .map(([uid, d]) => ({
      name: /^\d+$/.test(uid) ? `Staff #${uid}` : uid === 'unknown' ? 'Unassigned' : uid,
      totalOrders: d.totalOrders,
      gripOrders: d.gripOrders,
      gripQty: d.gripQty,
      gripRevenue: parseFloat(d.gripRevenue.toFixed(2)),
      ratio: d.totalOrders > 0 ? parseFloat(((d.gripOrders / d.totalOrders) * 100).toFixed(1)) : 0,
    }))
    .filter(c => c.totalOrders > 0)
    .sort((a, b) => b.gripOrders - a.gripOrders || b.ratio - a.ratio)

  return {
    summary: {
      gripQty: accGripQty,
      gripRevenue: parseFloat(accGripRevenue.toFixed(2)),
      posQty: accPosQty,
      posRevenue: parseFloat(accPosRevenue.toFixed(2)),
      pctQty: accPosQty > 0 ? parseFloat(((accGripQty / accPosQty) * 100).toFixed(1)) : 0,
      pctRevenue: accPosRevenue > 0 ? parseFloat(((accGripRevenue / accPosRevenue) * 100).toFixed(1)) : 0,
    },
    byStore,
    byColleague,
  }
}

export function buildGripEmail(data, dateLabel) {
  const s = data.summary
  const cell = 'padding:10px 14px;border-bottom:1px solid #eee;font-size:13px;'
  const head = 'padding:10px 14px;background:#f8f9fa;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#555;border-bottom:2px solid #e4e4e4;'
  const num = cell + 'text-align:right;'
  const headNum = head + 'text-align:right;'

  const storeRows = data.byStore.map(r => `
    <tr>
      <td style="${cell}">${r.store}</td>
      <td style="${num}font-weight:600;">${r.gripQty}</td>
      <td style="${num}">${fmtGbp(r.gripRevenue)}</td>
      <td style="${num}color:#aaa;">${r.posQty.toLocaleString()}</td>
      <td style="${num}color:#aaa;">${fmtGbp(r.posRevenue)}</td>
      <td style="${num}font-weight:700;color:${r.pctQty >= 5 ? '#005F2C' : '#333'};">${r.pctQty}%</td>
      <td style="${num}font-weight:700;color:${r.pctRevenue >= 5 ? '#005F2C' : '#333'};">${r.pctRevenue}%</td>
    </tr>`).join('')

  const colleagueRows = data.byColleague.map(c => `
    <tr>
      <td style="${cell}font-weight:500;">${c.name}</td>
      <td style="${num}font-weight:600;">${c.gripOrders}</td>
      <td style="${num}color:#aaa;">${c.totalOrders}</td>
      <td style="${num}font-weight:700;color:${c.ratio >= 20 ? '#005F2C' : c.ratio >= 10 ? '#d97706' : '#333'};">${c.ratio}%</td>
      <td style="${num}">${c.gripQty}</td>
      <td style="${num}">${fmtGbp(c.gripRevenue)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>GC4C Grip Sales</title></head>
<body style="margin:0;padding:20px;background:#f4f5f7;font-family:Arial,sans-serif;">
<div style="max-width:680px;margin:0 auto;">
  <div style="background:#005F2C;padding:24px 28px;border-radius:8px 8px 0 0;">
    <div style="color:white;font-size:20px;font-weight:700;">GC4C Grip Sales — POS</div>
    <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">${dateLabel}</div>
  </div>
  <div style="background:white;padding:20px 28px;border-bottom:1px solid #eee;">
    <table width="100%" cellspacing="0" cellpadding="0"><tr>
      <td style="text-align:center;padding:0 16px 0 0;border-right:1px solid #eee;">
        <div style="font-size:28px;font-weight:700;color:#111;">${s.gripQty}</div>
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">Grip Units</div>
      </td>
      <td style="text-align:center;padding:0 16px;border-right:1px solid #eee;">
        <div style="font-size:28px;font-weight:700;color:#111;">${fmtGbp(s.gripRevenue)}</div>
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">Grip Revenue</div>
      </td>
      <td style="text-align:center;padding:0 16px;border-right:1px solid #eee;">
        <div style="font-size:28px;font-weight:700;color:#005F2C;">${s.pctQty}%</div>
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">of POS Items</div>
      </td>
      <td style="text-align:center;padding:0 0 0 16px;">
        <div style="font-size:28px;font-weight:700;color:#005F2C;">${s.pctRevenue}%</div>
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">of POS Revenue</div>
      </td>
    </tr></table>
  </div>
  <div style="background:white;padding:0 0 8px;">
    <div style="padding:16px 28px 8px;font-size:12px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">By Store</div>
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <thead><tr>
        <th style="${head}">Store</th>
        <th style="${headNum}">Grip Units</th><th style="${headNum}">Grip Revenue</th>
        <th style="${headNum}">POS Items</th><th style="${headNum}">POS Revenue</th>
        <th style="${headNum}">% Items</th><th style="${headNum}">% Revenue</th>
      </tr></thead>
      <tbody>
        ${storeRows}
        <tr style="background:#f7f8fa;">
          <td style="${cell}font-weight:700;">Total</td>
          <td style="${num}font-weight:700;">${s.gripQty}</td>
          <td style="${num}font-weight:700;">${fmtGbp(s.gripRevenue)}</td>
          <td style="${num}font-weight:700;">${s.posQty.toLocaleString()}</td>
          <td style="${num}font-weight:700;">${fmtGbp(s.posRevenue)}</td>
          <td style="${num}font-weight:700;color:#005F2C;">${s.pctQty}%</td>
          <td style="${num}font-weight:700;color:#005F2C;">${s.pctRevenue}%</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div style="background:white;padding:0 0 8px;border-top:3px solid #f4f5f7;">
    <div style="padding:16px 28px 8px;font-size:12px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">By Colleague</div>
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <thead><tr>
        <th style="${head}">Colleague</th>
        <th style="${headNum}">Grip Orders</th><th style="${headNum}">Total Orders</th>
        <th style="${headNum}">Order Ratio</th><th style="${headNum}">Grip Units</th>
        <th style="${headNum}">Grip Revenue</th>
      </tr></thead>
      <tbody>${colleagueRows}</tbody>
    </table>
  </div>
  <div style="background:#f0f0f0;padding:14px 28px;border-radius:0 0 8px 8px;font-size:11px;color:#999;">
    Automated weekly report &mdash; <a href="https://gc4creportsandstock.netlify.app/grip-sales" style="color:#005F2C;">View live dashboard</a>
  </div>
</div>
</body></html>`
}

export async function run({ testRecipient, startDate, endDate, label } = {}) {
  if (!startDate) {
    const dates = getLastWeekDates()
    startDate = dates.startDate
    endDate = dates.endDate
    label = dates.label
  }
  const data = await fetchGripData(startDate, endDate)
  await sendEmail({
    to: testRecipient || REPORT_RECIPIENTS,
    subject: `GC4C Grip Sales — ${label}`,
    html: buildGripEmail(data, label),
  })
  console.log(`Grip email sent for ${label}`)
}
