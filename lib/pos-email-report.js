import { shopifyFetchPage, shopifyGetOne, shopifyGraphQL } from './shopify.js'
import { sendEmail, REPORT_RECIPIENTS } from './mailer.js'

const STORE_ORDER = ['Edinburgh', 'Milton Keynes', 'Southampton', 'Warrington']

const fmtGbp = n =>
  `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function getDateRanges() {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1
  const monday = new Date(now.getTime() - dow * 86400000)
  monday.setHours(0, 0, 0, 0)
  const wtdStart = monday.toISOString().slice(0, 10)

  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const mondayLY = new Date(monday.getTime() - 364 * 86400000)
  const todayLY = new Date(now.getTime() - 364 * 86400000)

  const mtdStartLY = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10)
  const mtdEndLY = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10)

  return {
    today: now,
    todayStr,
    wtd: { start: wtdStart, end: todayStr },
    mtd: { start: mtdStart, end: todayStr },
    wtdLY: { start: mondayLY.toISOString().slice(0, 10), end: todayLY.toISOString().slice(0, 10) },
    mtdLY: { start: mtdStartLY, end: mtdEndLY },
  }
}

async function fetchOrders(locationId, startDate, endDate, full = true) {
  const orders = []
  let pageInfo = null
  const fields = full ? 'id,total_price,subtotal_price,total_discounts,line_items' : 'id,total_price'
  do {
    const params = pageInfo ? { page_info: pageInfo } : {
      status: 'any',
      fields,
      created_at_min: new Date(startDate).toISOString(),
      created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
      location_id: String(locationId),
      limit: 250,
    }
    const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)
    orders.push(...items)
    pageInfo = nextPageInfo
  } while (pageInfo)
  return orders
}

async function fetchReturnsAndRefundsForRanges(locationId, wtdStart, mtdStart, endDate) {
  // 30-day lookback from mtdStart covers all reasonable POS return windows
  const lookback = new Date(mtdStart)
  lookback.setDate(lookback.getDate() - 30)
  const lookbackStr = lookback.toISOString().slice(0, 10)
  let wtd = 0, mtd = 0
  let cursor = null
  let hasMore = true

  while (hasMore) {
    const result = await shopifyGraphQL(`
      query($cursor: String) {
        orders(
          first: 50
          after: $cursor
          query: "location_id:${locationId} updated_at:>='${lookbackStr}'"
        ) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              returns(first: 20) {
                edges {
                  node {
                    createdAt
                    status
                    returnLineItems(first: 50) {
                      edges {
                        node {
                          quantity
                          subtotalSet { shopMoney { amount } }
                        }
                      }
                    }
                  }
                }
              }
              refunds {
                processedAt
                transactions {
                  kind
                  status
                  amountSet { shopMoney { amount } }
                }
              }
            }
          }
        }
      }
    `, { cursor })

    const ordersData = result?.orders
    if (!ordersData) break

    for (const { node: order } of (ordersData.edges || [])) {
      const returnEdges = order.returns?.edges || []

      if (returnEdges.length > 0) {
        // New Returns workflow (POS Return button): sum line item values by return date
        for (const { node: ret } of returnEdges) {
          if (ret.status === 'CANCELLED' || ret.status === 'DECLINED') continue
          const d = (ret.createdAt || '').slice(0, 10)
          if (d < mtdStart || d > endDate) continue

          let val = 0
          for (const { node: rli } of (ret.returnLineItems?.edges || [])) {
            val += parseFloat(rli.subtotalSet?.shopMoney?.amount || 0)
          }
          if (d >= wtdStart) wtd += val
          mtd += val
        }
      } else {
        // Legacy path (POS Refund button): order has no Return object
        for (const refund of (order.refunds || [])) {
          const d = (refund.processedAt || '').slice(0, 10)
          if (!d || d < mtdStart || d > endDate) continue
          for (const tx of (refund.transactions || [])) {
            if (tx.kind !== 'refund' || tx.status !== 'success') continue
            const amount = parseFloat(tx.amountSet?.shopMoney?.amount || 0)
            if (d >= wtdStart) wtd += amount
            mtd += amount
          }
        }
      }
    }

    hasMore = ordersData.pageInfo.hasNextPage
    cursor = ordersData.pageInfo.endCursor
  }

  return { wtd: parseFloat(wtd.toFixed(2)), mtd: parseFloat(mtd.toFixed(2)) }
}

async function fetchVariantCosts(variantIds) {
  const costs = {}
  const unique = [...new Set(variantIds.filter(Boolean))]
  if (!unique.length) return costs
  for (let i = 0; i < unique.length; i += 250) {
    const batch = unique.slice(i, i + 250)
    const data = await shopifyGraphQL(`
      query GetCosts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            inventoryItem { unitCost { amount } }
          }
        }
      }
    `, { ids: batch.map(id => `gid://shopify/ProductVariant/${id}`) })
    for (const node of (data.nodes || [])) {
      if (!node?.id) continue
      const numId = parseInt(node.id.split('/').pop())
      costs[numId] = parseFloat(node.inventoryItem?.unitCost?.amount || 0)
    }
  }
  return costs
}

function calcMetrics(orders, variantCosts, totalRefunds = 0) {
  let totalSales = 0, totalSubtotal = 0, totalDiscounts = 0, totalCost = 0
  const orderCount = orders.length
  for (const order of orders) {
    totalSales += parseFloat(order.total_price || 0)
    totalSubtotal += parseFloat(order.subtotal_price || 0)
    totalDiscounts += parseFloat(order.total_discounts || 0)
    for (const item of (order.line_items || [])) {
      totalCost += (variantCosts[item.variant_id] || 0) * item.quantity
    }
  }
  const gross = totalSubtotal + totalDiscounts
  return {
    totalSales: parseFloat(totalSales.toFixed(2)),
    totalCost: parseFloat(totalCost.toFixed(2)),
    totalDiscounts: parseFloat(totalDiscounts.toFixed(2)),
    totalRefunds: parseFloat(totalRefunds.toFixed(2)),
    orderCount,
    margin: totalSubtotal > 0 ? parseFloat(((totalSubtotal - totalCost) / totalSubtotal * 100).toFixed(1)) : 0,
    atv: orderCount > 0 ? parseFloat((totalSales / orderCount).toFixed(2)) : 0,
    discountPct: gross > 0 ? parseFloat((totalDiscounts / gross * 100).toFixed(1)) : 0,
    returnPct: totalSales > 0 ? parseFloat((totalRefunds / totalSales * 100).toFixed(1)) : 0,
  }
}

function lyTotal(orders) {
  return parseFloat(orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0).toFixed(2))
}

async function fetchReportData(ranges) {
  const locData = await shopifyGetOne('locations.json')
  const locations = (locData.locations || []).filter(l => STORE_ORDER.includes(l.name))

  const perLocation = await Promise.all(locations.map(async (loc) => {
    const [wtd, mtd, wtdLY, mtdLY, refunds] = await Promise.all([
      fetchOrders(loc.id, ranges.wtd.start, ranges.wtd.end, true),
      fetchOrders(loc.id, ranges.mtd.start, ranges.mtd.end, true),
      fetchOrders(loc.id, ranges.wtdLY.start, ranges.wtdLY.end, false),
      fetchOrders(loc.id, ranges.mtdLY.start, ranges.mtdLY.end, false),
      fetchReturnsAndRefundsForRanges(loc.id, ranges.wtd.start, ranges.mtd.start, ranges.todayStr),
    ])
    return { loc, wtd, mtd, wtdLY, mtdLY, wtdRefunds: refunds.wtd, mtdRefunds: refunds.mtd }
  }))

  const allVariantIds = []
  for (const { wtd, mtd } of perLocation) {
    for (const order of [...wtd, ...mtd]) {
      for (const item of (order.line_items || [])) allVariantIds.push(item.variant_id)
    }
  }
  const variantCosts = await fetchVariantCosts(allVariantIds)

  return perLocation.map(({ loc, wtd, mtd, wtdLY, mtdLY, wtdRefunds, mtdRefunds }) => ({
    store: loc.name,
    wtd: calcMetrics(wtd, variantCosts, wtdRefunds),
    mtd: calcMetrics(mtd, variantCosts, mtdRefunds),
    wtdLYSales: lyTotal(wtdLY),
    mtdLYSales: lyTotal(mtdLY),
  }))
}

function vsLY(current, ly) {
  if (ly === 0) return '<span style="color:#aaa;">N/A</span>'
  const pct = ((current - ly) / ly * 100).toFixed(1)
  const up = parseFloat(pct) >= 0
  return `<span style="color:${up ? '#005F2C' : '#dc2626'};font-weight:700;">${up ? '▲' : '▼'} ${Math.abs(parseFloat(pct))}%</span>`
}

function fmtShortDate(s) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function buildPosEmail(storeData, ranges) {
  const dayLabel = ranges.today.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const cell = 'padding:9px 12px;border-bottom:1px solid #eee;font-size:13px;'
  const head = 'padding:9px 12px;background:#f8f9fa;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#555;border-bottom:2px solid #e4e4e4;'
  const num = cell + 'text-align:right;'
  const headNum = head + 'text-align:right;'

  function sectionTable(period, lyKey) {
    const rows = storeData.map(s => {
      const d = s[period]
      const ly = s[lyKey]
      return `<tr>
        <td style="${cell}font-weight:600;">${s.store}</td>
        <td style="${num}">${fmtGbp(d.totalSales)}</td>
        <td style="${num}">${vsLY(d.totalSales, ly)}</td>
        <td style="${num}font-weight:700;color:${d.margin >= 41 ? '#005F2C' : d.margin > 0 ? '#dc2626' : '#aaa'};">${d.margin > 0 ? d.margin + '%' : '—'}</td>
        <td style="${num}color:${d.atv >= 230 ? '#005F2C' : d.atv > 0 ? '#dc2626' : '#333'};">${d.atv > 0 ? fmtGbp(d.atv) : '—'}</td>
        <td style="${num}color:${d.discountPct > 3 ? '#dc2626' : '#005F2C'};">${d.discountPct > 0 ? d.discountPct + '%' : '—'}</td>
        <td style="${num}color:${d.returnPct > 10 ? '#dc2626' : d.returnPct > 0 ? '#005F2C' : '#333'};">${d.returnPct > 0 ? d.returnPct + '%' : '—'}</td>
      </tr>`
    }).join('')

    const t = storeData.reduce((acc, s) => {
      const d = s[period]
      acc.sales += d.totalSales; acc.cost += d.totalCost
      acc.discounts += d.totalDiscounts; acc.refunds += d.totalRefunds
      acc.orders += d.orderCount; acc.ly += s[lyKey]
      return acc
    }, { sales: 0, cost: 0, discounts: 0, refunds: 0, orders: 0, ly: 0 })
    const tMargin = t.sales > 0 ? parseFloat(((t.sales - t.cost) / t.sales * 100).toFixed(1)) : 0
    const tAtv = t.orders > 0 ? parseFloat((t.sales / t.orders).toFixed(2)) : 0
    const tGross = t.sales + t.discounts
    const tDisc = tGross > 0 ? parseFloat((t.discounts / tGross * 100).toFixed(1)) : 0
    const tRet = t.sales > 0 ? parseFloat((t.refunds / t.sales * 100).toFixed(1)) : 0

    return `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <thead><tr>
        <th style="${head}">Store</th>
        <th style="${headNum}">Total Sales</th>
        <th style="${headNum}">vs LY</th>
        <th style="${headNum}">Margin %</th>
        <th style="${headNum}">Avg Txn</th>
        <th style="${headNum}">Discount %</th>
        <th style="${headNum}">Return %</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr style="background:#f7f8fa;border-top:2px solid #e4e4e4;">
          <td style="${cell}font-weight:700;">Total</td>
          <td style="${num}font-weight:700;">${fmtGbp(t.sales)}</td>
          <td style="${num}">${vsLY(t.sales, t.ly)}</td>
          <td style="${num}font-weight:700;color:${tMargin >= 41 ? '#005F2C' : tMargin > 0 ? '#dc2626' : '#333'};">${tMargin > 0 ? tMargin + '%' : '—'}</td>
          <td style="${num}font-weight:700;color:${tAtv >= 230 ? '#005F2C' : tAtv > 0 ? '#dc2626' : '#333'};">${tAtv > 0 ? fmtGbp(tAtv) : '—'}</td>
          <td style="${num}color:${tDisc > 3 ? '#dc2626' : '#005F2C'};">${tDisc > 0 ? tDisc + '%' : '—'}</td>
          <td style="${num}color:${tRet > 10 ? '#dc2626' : tRet > 0 ? '#005F2C' : '#333'};">${tRet > 0 ? tRet + '%' : '—'}</td>
        </tr>
      </tbody>
    </table>`
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>GC4C POS Performance</title></head>
<body style="margin:0;padding:20px;background:#f4f5f7;font-family:Arial,sans-serif;">
<div style="max-width:720px;margin:0 auto;">
  <div style="background:#005F2C;padding:24px 28px;border-radius:8px 8px 0 0;">
    <div style="color:white;font-size:20px;font-weight:700;">GC4C POS Performance</div>
    <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">${dayLabel}</div>
  </div>
  <div style="background:white;padding:0 0 8px;">
    <div style="padding:16px 28px 8px;font-size:12px;font-weight:700;color:#005F2C;text-transform:uppercase;letter-spacing:0.06em;">
      Week to Date &mdash; ${fmtShortDate(ranges.wtd.start)} to Today
    </div>
    ${sectionTable('wtd', 'wtdLYSales')}
  </div>
  <div style="background:white;padding:0 0 8px;border-top:4px solid #f4f5f7;">
    <div style="padding:16px 28px 8px;font-size:12px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.06em;">
      Month to Date &mdash; ${fmtShortDate(ranges.mtd.start)} to Today
    </div>
    ${sectionTable('mtd', 'mtdLYSales')}
  </div>
  <div style="background:#f0f0f0;padding:14px 28px;border-radius:0 0 8px 8px;font-size:11px;color:#999;">
    Automated daily report from GC4C Reports &mdash; <a href="https://gc4creportsandstock.netlify.app" style="color:#005F2C;">View dashboard</a>
  </div>
</div>
</body></html>`
}

export async function run({ testRecipient } = {}) {
  const ranges = getDateRanges()
  const storeData = await fetchReportData(ranges)
  const dateStr = ranges.today.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  await sendEmail({
    to: testRecipient || REPORT_RECIPIENTS,
    subject: `GC4C POS Performance — ${dateStr}`,
    html: buildPosEmail(storeData, ranges),
  })
  console.log(`Daily POS email sent for ${ranges.todayStr}`)
}
