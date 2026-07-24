import { shopifyFetchPage, shopifyGetOne, shopifyGraphQL } from './shopify.js'
import { sendEmail, POS_RECIPIENTS } from './mailer.js'

const STORE_ORDER = ['Edinburgh', 'Milton Keynes', 'Southampton', 'Warrington']

const fmtGbp = n =>
  `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function getDateRanges() {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const dayLYStr = new Date(now.getTime() - 364 * 86400000).toISOString().slice(0, 10)

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
    day:   { start: todayStr, end: todayStr },
    dayLY: { start: dayLYStr, end: dayLYStr },
    wtd: { start: wtdStart, end: todayStr },
    mtd: { start: mtdStart, end: todayStr },
    wtdLY: { start: mondayLY.toISOString().slice(0, 10), end: todayLY.toISOString().slice(0, 10) },
    mtdLY: { start: mtdStartLY, end: mtdEndLY },
  }
}

async function fetchShopifyQLSalesData(since, until) {
  const query = `FROM sales SHOW orders, gross_sales, discounts, net_sales, shipping_charges, taxes, total_sales, gross_margin, average_order_value WHERE is_pos_sale = true GROUP BY pos_location_name WITH TOTALS SINCE ${since} UNTIL ${until} ORDER BY total_sales DESC LIMIT 1000`
  const data = await shopifyGraphQL(`{
    shopifyqlQuery(query: ${JSON.stringify(query)}) {
      tableData {
        columns { name }
        rows
      }
      parseErrors
    }
  }`)
  if (data.shopifyqlQuery?.parseErrors?.length) {
    console.error('ShopifyQL parseErrors:', JSON.stringify(data.shopifyqlQuery.parseErrors))
  }
  const tableData = data.shopifyqlQuery?.tableData
  if (!tableData?.rows) return new Map()
  const rows = Array.isArray(tableData.rows) ? tableData.rows : JSON.parse(tableData.rows)
  const result = new Map()
  for (const row of rows) {
    const storeName = row.pos_location_name
    const gm         = parseFloat(row.gross_margin || 0)
    const grossSales  = parseFloat(row.gross_sales  || 0)
    const discounts   = parseFloat(row.discounts    || 0)
    const netSales    = parseFloat(row.net_sales    || 0)
    const totalSales  = parseFloat(row.total_sales  || 0)
    const salesReversals = netSales - grossSales - discounts
    const parsed = {
      totalSales,
      netSales,
      grossMarginPct: gm > 1 ? parseFloat(gm.toFixed(1)) : parseFloat((gm * 100).toFixed(1)),
      ordersCount:    parseInt(row.orders || row.orders_count || 0, 10),
      avgOrderValue:  parseFloat(row.average_order_value  || 0),
      returnPct:      totalSales > 0 ? parseFloat((Math.abs(salesReversals) / totalSales * 100).toFixed(1)) : 0,
    }
    result.set(storeName || '*', parsed)
  }
  return result
}

async function fetchShopifyQLSummaryAov(since, until) {
  const query = `FROM sales SHOW average_order_value WHERE is_pos_sale = true SINCE ${since} UNTIL ${until}`
  const data = await shopifyGraphQL(`{
    shopifyqlQuery(query: ${JSON.stringify(query)}) {
      tableData { rows }
      parseErrors
    }
  }`)
  const tableData = data.shopifyqlQuery?.tableData
  if (!tableData?.rows) return 0
  const rows = Array.isArray(tableData.rows) ? tableData.rows : JSON.parse(tableData.rows)
  return parseFloat(rows[0]?.average_order_value || 0)
}

async function fetchOrders(locationId, startDate, endDate, full = true) {
  const orders = []
  let pageInfo = null
  const fields = full ? 'id,total_price,subtotal_price,total_discounts,total_tax,discount_codes,line_items' : 'id,total_price'
  do {
    const params = pageInfo ? { page_info: pageInfo } : {
      status: 'any',
      source_name: 'pos',
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

async function fetchRefundLineItemsForRanges(locationId, wtdStart, mtdStart, endDate) {
  // No financial_status filter — fetches ALL orders updated in period including
  // exchanges (financial_status stays 'paid'). Uses refund_line_items.subtotal
  // which captures item value for both cash returns AND exchanges.
  const lookbackStr = wtdStart < mtdStart ? wtdStart : mtdStart
  let wtd = 0, mtd = 0
  let pageInfo = null

  do {
    const params = pageInfo ? { page_info: pageInfo } : {
      status: 'any',
      source_name: 'pos',
      fields: 'id,refunds',
      updated_at_min: new Date(lookbackStr).toISOString(),
      location_id: String(locationId),
      limit: 250,
    }
    const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)

    for (const order of items) {
      for (const refund of (order.refunds || [])) {
        const d = (refund.processed_at || '').slice(0, 10)
        if (!d || d < mtdStart || d > endDate) continue
        let val = 0
        for (const rli of (refund.refund_line_items || [])) {
          val += parseFloat(rli.subtotal || 0) - parseFloat(rli.total_tax || 0)
        }
        if (val > 0) {
          if (d >= wtdStart) wtd += val
          mtd += val
        }
      }
    }

    pageInfo = nextPageInfo
  } while (pageInfo)

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

function calcMetrics(orders, variantCosts, totalRefunds = 0, overrideTotalSales = null, overrideNetSales = null, overrideMargin = null, overrideOrderCount = null, overrideAtv = null, overrideReturnPct = null) {
  let totalSales = 0, totalSubtotal = 0, totalDiscounts = 0, totalCost = 0, totalTax = 0, loyaltyDiscounts = 0
  const orderCount = orders.length
  for (const order of orders) {
    totalSales += parseFloat(order.total_price || 0)
    totalSubtotal += parseFloat(order.subtotal_price || 0)
    totalDiscounts += parseFloat(order.total_discounts || 0)
    totalTax += parseFloat(order.total_tax || 0)
    for (const dc of (order.discount_codes || [])) {
      if ((dc.code || '').toUpperCase().startsWith('LL-')) {
        loyaltyDiscounts += parseFloat(dc.amount || 0)
      }
    }
    for (const item of (order.line_items || [])) {
      totalCost += (variantCosts[item.variant_id] || 0) * item.quantity
    }
  }
  const finalTotalSales = overrideTotalSales !== null ? overrideTotalSales : parseFloat(totalSales.toFixed(2))
  const finalOrderCount = overrideOrderCount !== null ? overrideOrderCount : orderCount
  const nonLoyaltyDiscounts = totalDiscounts - loyaltyDiscounts
  const gross = totalSubtotal + nonLoyaltyDiscounts
  const netRevenue = totalSubtotal - totalTax
  // Use ShopifyQL net_sales as margin base so it matches Shopify Analytics gross margin exactly
  const marginBase = overrideNetSales !== null ? overrideNetSales : netRevenue
  return {
    totalSales: finalTotalSales,
    totalSubtotal: parseFloat(totalSubtotal.toFixed(2)),
    totalTax: parseFloat(totalTax.toFixed(2)),
    totalCost: parseFloat(totalCost.toFixed(2)),
    totalDiscounts: parseFloat(totalDiscounts.toFixed(2)),
    loyaltyDiscounts: parseFloat(loyaltyDiscounts.toFixed(2)),
    totalRefunds: parseFloat(totalRefunds.toFixed(2)),
    orderCount,
    margin: overrideMargin !== null ? overrideMargin : (marginBase > 0 ? parseFloat(((marginBase - totalCost) / marginBase * 100).toFixed(1)) : 0),
    atv: overrideAtv !== null ? overrideAtv : (finalOrderCount > 0 ? parseFloat((finalTotalSales / finalOrderCount).toFixed(2)) : 0),
    discountPct: gross > 0 ? parseFloat((nonLoyaltyDiscounts / gross * 100).toFixed(1)) : 0,
    returnPct: overrideReturnPct !== null ? overrideReturnPct : (netRevenue > 0 ? parseFloat((totalRefunds / netRevenue * 100).toFixed(1)) : 0),
    sqlNetSales: overrideNetSales !== null ? overrideNetSales : 0,
    sqlGrossProfit: (overrideMargin !== null && overrideNetSales !== null) ? parseFloat((overrideMargin * overrideNetSales / 100).toFixed(2)) : 0,
    sqlOrderCount: overrideOrderCount !== null ? overrideOrderCount : 0,
  }
}

async function fetchReportData(ranges) {
  const locData = await shopifyGetOne('locations.json')
  const locations = (locData.locations || []).filter(l => STORE_ORDER.includes(l.name))

  // ShopifyQL for accurate sales totals (matches Shopify Analytics) + LY comparisons
  // Failures are non-fatal — falls back to orders data so email always sends
  const safeSQL = (since, until) => fetchShopifyQLSalesData(since, until).catch(err => {
    console.error('ShopifyQL fetch failed, falling back to orders data:', err.message)
    return new Map()
  })
  const safeAov = (since, until) => fetchShopifyQLSummaryAov(since, until).catch(() => 0)
  const [sqlDay, sqlWtd, sqlMtd, sqlDayLY, sqlWtdLY, sqlMtdLY, summaryAovDay, summaryAovWtd, summaryAovMtd, perLocationRaw] = await Promise.all([
    safeSQL(ranges.day.start, ranges.day.end),
    safeSQL(ranges.wtd.start, ranges.wtd.end),
    safeSQL(ranges.mtd.start, ranges.mtd.end),
    safeSQL(ranges.dayLY.start, ranges.dayLY.end),
    safeSQL(ranges.wtdLY.start, ranges.wtdLY.end),
    safeSQL(ranges.mtdLY.start, ranges.mtdLY.end),
    safeAov(ranges.day.start, ranges.day.end),
    safeAov(ranges.wtd.start, ranges.wtd.end),
    safeAov(ranges.mtd.start, ranges.mtd.end),
    Promise.all(locations.map(async (loc) => {
      const [wtd, mtd, refunds] = await Promise.all([
        fetchOrders(loc.id, ranges.wtd.start, ranges.wtd.end, true),
        fetchOrders(loc.id, ranges.mtd.start, ranges.mtd.end, true),
        fetchRefundLineItemsForRanges(loc.id, ranges.wtd.start, ranges.mtd.start, ranges.todayStr),
      ])
      // day orders are a subset of wtd — filter rather than extra API call
      const day = wtd.filter(o => (o.created_at || '').slice(0, 10) === ranges.todayStr)
      return { loc, wtd, mtd, day, wtdRefunds: refunds.wtd, mtdRefunds: refunds.mtd }
    })),
  ])

  const allVariantIds = []
  for (const { wtd, mtd } of perLocationRaw) {
    for (const order of [...wtd, ...mtd]) {
      for (const item of (order.line_items || [])) allVariantIds.push(item.variant_id)
    }
  }
  const variantCosts = await fetchVariantCosts(allVariantIds)

  const sql = (map, name) => map.get(name)
  return {
    stores: perLocationRaw.map(({ loc, wtd, mtd, day, wtdRefunds, mtdRefunds }) => {
      const n = loc.name
      return {
        store: n,
        day: calcMetrics(day, variantCosts, 0, sql(sqlDay, n)?.totalSales ?? null, sql(sqlDay, n)?.netSales ?? null, sql(sqlDay, n)?.grossMarginPct ?? null, sql(sqlDay, n)?.ordersCount ?? null, sql(sqlDay, n)?.avgOrderValue ?? null, sql(sqlDay, n)?.returnPct ?? null),
        wtd: calcMetrics(wtd, variantCosts, wtdRefunds, sql(sqlWtd, n)?.totalSales ?? null, sql(sqlWtd, n)?.netSales ?? null, sql(sqlWtd, n)?.grossMarginPct ?? null, sql(sqlWtd, n)?.ordersCount ?? null, sql(sqlWtd, n)?.avgOrderValue ?? null, sql(sqlWtd, n)?.returnPct ?? null),
        mtd: calcMetrics(mtd, variantCosts, mtdRefunds, sql(sqlMtd, n)?.totalSales ?? null, sql(sqlMtd, n)?.netSales ?? null, sql(sqlMtd, n)?.grossMarginPct ?? null, sql(sqlMtd, n)?.ordersCount ?? null, sql(sqlMtd, n)?.avgOrderValue ?? null, sql(sqlMtd, n)?.returnPct ?? null),
        dayLYSales: sql(sqlDayLY, n)?.totalSales || 0,
        wtdLYSales: sql(sqlWtdLY, n)?.totalSales || 0,
        mtdLYSales: sql(sqlMtdLY, n)?.totalSales || 0,
      }
    }),
    summaryAtv: {
      day: summaryAovDay || sqlDay.get('*')?.avgOrderValue || 0,
      wtd: summaryAovWtd || sqlWtd.get('*')?.avgOrderValue || 0,
      mtd: summaryAovMtd || sqlMtd.get('*')?.avgOrderValue || 0,
    },
    summaryReturnPct: {
      day: sqlDay.get('*')?.returnPct || 0,
      wtd: sqlWtd.get('*')?.returnPct || 0,
      mtd: sqlMtd.get('*')?.returnPct || 0,
    },
  }
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

export function buildPosEmail(storeData, ranges, summaryAtv = {}, summaryReturnPct = {}) {
  const dayLabel = ranges._customLabel
    ? `Period: ${ranges._customLabel}`
    : ranges.today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const cell = 'padding:9px 12px;border-bottom:1px solid #eee;font-size:13px;'
  const head = 'padding:9px 12px;background:#f8f9fa;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#555;border-bottom:2px solid #e4e4e4;'
  const num = cell + 'text-align:right;'
  const headNum = head + 'text-align:right;'

  function sectionTable(period, lyKey, sqlSummaryAtv = 0, overrideTotalReturnPct = null) {
    const rows = storeData.map(s => {
      const d = s[period]
      const ly = s[lyKey]
      return `<tr>
        <td style="${cell}font-weight:600;">${s.store}</td>
        <td style="${num}">${fmtGbp(d.totalSales)}</td>
        <td style="${num}">${vsLY(d.totalSales, ly)}</td>
        <td style="${num}font-weight:700;color:${d.margin >= 41 ? '#005F2C' : d.margin > 0 ? '#dc2626' : '#aaa'};">${d.margin > 0 ? d.margin + '%' : '—'}</td>
        <td style="${num}color:${d.atv >= 230 ? '#005F2C' : d.atv > 0 ? '#dc2626' : '#333'};">${d.atv > 0 ? fmtGbp(d.atv) : '—'}</td>
        <td style="${num}color:${d.discountPct > 2 ? '#dc2626' : '#005F2C'};">${d.discountPct > 0 ? d.discountPct + '%' : '—'}</td>
        <td style="${num}color:${d.returnPct > 10 ? '#dc2626' : d.returnPct > 0 ? '#005F2C' : '#333'};">${d.returnPct > 0 ? d.returnPct + '%' : '—'}</td>
      </tr>`
    }).join('')

    const t = storeData.reduce((acc, s) => {
      const d = s[period]
      acc.sales += d.totalSales; acc.subtotal += d.totalSubtotal; acc.tax += d.totalTax; acc.cost += d.totalCost
      acc.discounts += d.totalDiscounts; acc.loyaltyDiscounts += d.loyaltyDiscounts; acc.refunds += d.totalRefunds
      acc.orders += d.orderCount; acc.ly += s[lyKey]
      acc.sqlNetSales += d.sqlNetSales || 0; acc.sqlGrossProfit += d.sqlGrossProfit || 0; acc.sqlOrders += d.sqlOrderCount || 0
      if (s[lyKey] > 0) acc.lflSales += d.totalSales
      return acc
    }, { sales: 0, subtotal: 0, tax: 0, cost: 0, discounts: 0, loyaltyDiscounts: 0, refunds: 0, orders: 0, sqlOrders: 0, ly: 0, lflSales: 0, sqlNetSales: 0, sqlGrossProfit: 0 })
    const tNet = t.subtotal - t.tax
    const tMargin = t.sqlNetSales > 0
      ? parseFloat((t.sqlGrossProfit / t.sqlNetSales * 100).toFixed(1))
      : (tNet > 0 ? parseFloat(((tNet - t.cost) / tNet * 100).toFixed(1)) : 0)
    const tAtv = sqlSummaryAtv > 0 ? sqlSummaryAtv : (t.sqlOrders > 0 ? parseFloat((t.sales / t.sqlOrders).toFixed(2)) : (t.orders > 0 ? parseFloat((t.sales / t.orders).toFixed(2)) : 0))
    const tNonLoyaltyDiscounts = t.discounts - t.loyaltyDiscounts
    const tGross = t.subtotal + tNonLoyaltyDiscounts
    const tDisc = tGross > 0 ? parseFloat((tNonLoyaltyDiscounts / tGross * 100).toFixed(1)) : 0
    const tRet = overrideTotalReturnPct !== null ? overrideTotalReturnPct : (tNet > 0 ? parseFloat((t.refunds / tNet * 100).toFixed(1)) : 0)

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
          <td style="${num}">${vsLY(t.lflSales, t.ly)}</td>
          <td style="${num}font-weight:700;color:${tMargin >= 41 ? '#005F2C' : tMargin > 0 ? '#dc2626' : '#333'};">${tMargin > 0 ? tMargin + '%' : '—'}</td>
          <td style="${num}font-weight:700;color:${tAtv >= 230 ? '#005F2C' : tAtv > 0 ? '#dc2626' : '#333'};">${tAtv > 0 ? fmtGbp(tAtv) : '—'}</td>
          <td style="${num}color:${tDisc > 2 ? '#dc2626' : '#005F2C'};">${tDisc > 0 ? tDisc + '%' : '—'}</td>
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
    <div style="padding:16px 28px 8px;font-size:12px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.06em;">
      Today &mdash; ${fmtShortDate(ranges.todayStr)}
    </div>
    ${sectionTable('day', 'dayLYSales', summaryAtv.day || 0, summaryReturnPct.day || null)}
  </div>
  <div style="background:white;padding:0 0 8px;border-top:4px solid #f4f5f7;">
    <div style="padding:16px 28px 8px;font-size:12px;font-weight:700;color:#005F2C;text-transform:uppercase;letter-spacing:0.06em;">
      Week to Date &mdash; ${fmtShortDate(ranges.wtd.start)} to Today
    </div>
    ${sectionTable('wtd', 'wtdLYSales', summaryAtv.wtd || 0, summaryReturnPct.wtd || null)}
  </div>
  <div style="background:white;padding:0 0 8px;border-top:4px solid #f4f5f7;">
    <div style="padding:16px 28px 8px;font-size:12px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.06em;">
      Month to Date &mdash; ${fmtShortDate(ranges.mtd.start)} to Today
    </div>
    ${sectionTable('mtd', 'mtdLYSales', summaryAtv.mtd || 0, summaryReturnPct.mtd || null)}
  </div>
  <div style="background:#f0f0f0;padding:14px 28px;border-radius:0 0 8px 8px;font-size:11px;color:#999;">
    Automated daily report from GC4C Reports &mdash; <a href="https://gc4creportsandstock.netlify.app" style="color:#005F2C;">View dashboard</a>
  </div>
</div>
</body></html>`
}

export async function run({ testRecipient } = {}) {
  const ranges = getDateRanges()
  const { stores: storeData, summaryAtv, summaryReturnPct } = await fetchReportData(ranges)
  const dateStr = ranges.today.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  await sendEmail({
    to: testRecipient || POS_RECIPIENTS,
    subject: `GC4C POS Performance — ${dateStr}`,
    html: buildPosEmail(storeData, ranges, summaryAtv, summaryReturnPct),
  })
  console.log(`Daily POS email sent for ${ranges.todayStr}`)
}

export async function runCustomRange(from, to, { testRecipient } = {}) {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const fromLY = new Date(fromDate.getTime() - 364 * 86400000).toISOString().slice(0, 10)
  const toLY   = new Date(toDate.getTime()   - 364 * 86400000).toISOString().slice(0, 10)

  const fakeRanges = {
    today: toDate,
    todayStr: to,
    day:   { start: to, end: to },
    dayLY: { start: toLY, end: toLY },
    wtd:   { start: from, end: to },
    mtd:   { start: from, end: to },
    wtdLY: { start: fromLY, end: toLY },
    mtdLY: { start: fromLY, end: toLY },
  }

  const { stores: storeData, summaryAtv, summaryReturnPct } = await fetchReportData(fakeRanges)

  const label = `${fromDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–${toDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const subject = `GC4C POS Performance — ${label}`

  const html = buildPosEmail(storeData, {
    ...fakeRanges,
    today: toDate,
    _customLabel: label,
  }, summaryAtv, summaryReturnPct)

  await sendEmail({ to: testRecipient || POS_RECIPIENTS, subject, html })
  console.log(`Custom range POS email sent for ${from} to ${to}`)
}
