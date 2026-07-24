import React, { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const fmtGbp = n => `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtK   = n => n >= 1000 ? `£${(n / 1000).toFixed(0)}k` : `£${Math.round(n)}`

const CHART_METRICS = [
  { key: 'sales',    label: 'Total Sales', fmt: fmtGbp,                  yFmt: fmtK,                       unit: '£' },
  { key: 'margin',   label: 'Margin %',    fmt: v => `${v.toFixed(1)}%`, yFmt: v => `${v.toFixed(0)}%`,    unit: '%' },
  { key: 'avgtxn',  label: 'Avg Txn',     fmt: fmtGbp,                  yFmt: fmtK,                       unit: '£' },
  { key: 'discount', label: 'Discount %',  fmt: v => `${v.toFixed(1)}%`, yFmt: v => `${v.toFixed(0)}%`,    unit: '%' },
]

function getLastWeekDates() {
  const now = new Date()
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1
  const thisMonday = new Date(now.getTime() - dow * 86400000)
  const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000)
  const lastSunday = new Date(thisMonday.getTime() - 86400000)
  return {
    from: lastMonday.toISOString().slice(0, 10),
    to:   lastSunday.toISOString().slice(0, 10),
  }
}

function today() { return new Date().toISOString().slice(0, 10) }
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10) }

function vsLY(current, ly) {
  if (!ly) return <span style={{ color: '#aaa' }}>N/A</span>
  const pct = ((current - ly) / ly * 100).toFixed(1)
  const up = parseFloat(pct) >= 0
  return (
    <span style={{ color: up ? '#005F2C' : '#dc2626', fontWeight: 700 }}>
      {up ? '▲' : '▼'} {Math.abs(parseFloat(pct))}%
    </span>
  )
}

function fmtDate(s) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ChartTooltip({ active, payload, label, valueFmt }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e4', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, display: 'flex', gap: 16, justifyContent: 'space-between' }}>
          <span>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{valueFmt ? valueFmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

const STORE_COLORS = {
  'Edinburgh':    '#005F2C',
  'Milton Keynes':'#1d4ed8',
  'Southampton':  '#d97706',
  'Warrington':   '#7c3aed',
}

function fmtTrendDate(dateStr, grain) {
  if (!dateStr) return ''
  if (grain === 'week') {
    const d = new Date(dateStr)
    return `w/c ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  }
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function TrendSection() {
  const defaults = (() => {
    const to = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10)
    return { from, to }
  })()
  const [from, setFrom]     = useState(defaults.from)
  const [to, setTo]         = useState(defaults.to)
  const [trendData, setTrend] = useState(null)
  const [grain, setGrain]   = useState('day')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  async function loadTrend() {
    setLoading(true); setError(null); setTrend(null)
    try {
      const res = await fetch(`/api/pos-store-trend?from=${from}&to=${to}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setTrend(json.data)
      setGrain(json.grain)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const stores = trendData ? [...new Set(trendData.flatMap(d => Object.keys(d).filter(k => k !== 'date')))] : []

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
          Store Trend
        </h2>
        <span style={{ fontSize: 12, color: '#888' }}>Compare store performance over time</span>
      </div>
      <div className="controls" style={{ marginBottom: 16 }}>
        <div className="field"><label>From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="field"><label>To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={loadTrend} disabled={loading}>
          {loading ? 'Loading…' : 'Load Trend'}
        </button>
      </div>
      {error && <div className="state-box error" style={{ marginBottom: 16 }}>{error}</div>}
      {loading && <div className="state-box"><div className="spinner" /><div>Loading trend data…</div></div>}
      {trendData && trendData.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e4e4e4', borderRadius: 8, padding: '16px 12px 8px' }}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={d => fmtTrendDate(d, grain)}
                tick={{ fontSize: 11, fill: '#999' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={fmtK}
                tick={{ fontSize: 11, fill: '#999' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                formatter={(v, name) => [fmtGbp(v), name]}
                labelFormatter={d => fmtTrendDate(d, grain)}
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e4e4e4' }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              {stores.map(store => (
                <Line
                  key={store}
                  type="monotone"
                  dataKey={store}
                  stroke={STORE_COLORS[store] || '#888'}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {trendData && trendData.length === 0 && (
        <div className="state-box">No sales data for this period.</div>
      )}
    </div>
  )
}

export default function POSReportPage() {
  const defaults = getLastWeekDates()
  const [from, setFrom]       = useState(defaults.from)
  const [to, setTo]           = useState(defaults.to)
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [chartMetric, setChartMetric] = useState('sales')

  async function loadData() {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch(`/api/pos-report-data?from=${from}&to=${to}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function quickDate(preset) {
    const d = new Date()
    if (preset === 'today') {
      setFrom(today()); setTo(today())
    } else if (preset === 'week') {
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
      setFrom(new Date(d - dow * 86400000).toISOString().slice(0, 10)); setTo(today())
    } else if (preset === 'month') {
      setFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)); setTo(today())
    } else if (preset === 'lastweek') {
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
      const thisMonday = new Date(d.getTime() - dow * 86400000)
      setFrom(new Date(thisMonday.getTime() - 7 * 86400000).toISOString().slice(0, 10))
      setTo(new Date(thisMonday.getTime() - 86400000).toISOString().slice(0, 10))
    } else {
      setFrom(daysAgo(29)); setTo(today())
    }
  }

  const totals = data?.stores?.reduce((acc, s) => ({
    totalSales:   acc.totalSales   + (s.totalSales   || 0),
    totalSalesLY: acc.totalSalesLY + (s.totalSalesLY || 0),
    grossSales:   acc.grossSales   + (s.grossSales   || 0),
    discounts:    acc.discounts    + (s.discounts    || 0),
    netSales:     acc.netSales     + (s.netSales     || 0),
    ordersCount:  acc.ordersCount  + (s.ordersCount  || 0),
    grossProfit:  acc.grossProfit  + ((s.netSales || 0) * (s.grossMargin || 0)),
  }), { totalSales: 0, totalSalesLY: 0, grossSales: 0, discounts: 0, netSales: 0, ordersCount: 0, grossProfit: 0 })

  const totalMargin  = totals?.netSales > 0 ? parseFloat((totals.grossProfit / totals.netSales * 100).toFixed(1)) : 0
  const totalAvgTxn  = data?.summaryAov || (totals?.ordersCount > 0 ? parseFloat((totals.totalSales / totals.ordersCount).toFixed(2)) : 0)
  const totalDiscPct = totals?.grossSales > 0 ? parseFloat((Math.abs(totals.discounts) / totals.grossSales * 100).toFixed(1)) : 0
  // LFL vs LY: only compare stores that have LY data (same as email)
  const lflCurrent = data?.stores?.reduce((sum, s) => s.totalSalesLY > 0 ? sum + (s.totalSales || 0) : sum, 0) || 0
  const lflLY      = data?.stores?.reduce((sum, s) => sum + (s.totalSalesLY || 0), 0) || 0

  const activeMetric = CHART_METRICS.find(m => m.key === chartMetric)

  const chartData = data?.stores?.map(s => {
    const avgTxn    = s.avgOrderValue   || (s.ordersCount   > 0 ? s.totalSales   / s.ordersCount   : 0)
    const avgTxnLY  = s.avgOrderValueLY || (s.ordersCountLY > 0 ? s.totalSalesLY / s.ordersCountLY : 0)
    const discPct   = s.grossSales   > 0 ? Math.abs(s.discounts)   / s.grossSales   * 100 : 0
    const discPctLY = s.grossSalesLY > 0 ? Math.abs(s.discountsLY) / s.grossSalesLY * 100 : 0
    const vals = {
      sales:    { cur: s.totalSales || 0,        ly: s.totalSalesLY || 0 },
      margin:   { cur: (s.grossMargin  || 0) * 100, ly: (s.grossMarginLY || 0) * 100 },
      avgtxn:   { cur: avgTxn,                   ly: avgTxnLY },
      discount: { cur: discPct,                  ly: discPctLY },
    }
    return {
      name:          s.name === 'Milton Keynes' ? 'MK' : s.name,
      'This Period': parseFloat(vals[chartMetric].cur.toFixed(2)),
      'Last Year':   parseFloat(vals[chartMetric].ly.toFixed(2)),
    }
  })

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">POS Sales Report</h1>
          <p className="page-sub">Generate a store performance report for any date range. Numbers pull directly from Shopify Analytics.</p>
        </div>
      </div>

      <div className="controls">
        <div className="field">
          <label>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={loadData} disabled={loading}>
          {loading ? 'Loading…' : 'Generate Report'}
        </button>
        <div className="date-presets" style={{ marginBottom: 0 }}>
          {[['Today', 'today'], ['This Week', 'week'], ['This Month', 'month'], ['Last Week', 'lastweek'], ['Last 30d', '30d']].map(([label, preset]) => (
            <button key={preset} className="preset-btn" onClick={() => quickDate(preset)}>{label}</button>
          ))}
        </div>
      </div>

      {error && <div className="state-box error" style={{ marginBottom: 20 }}>{error}</div>}

      {loading && (
        <div className="state-box">
          <div className="spinner" />
          <div>Loading report data…</div>
        </div>
      )}

      {data && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              By Store
            </h2>
            <span style={{ fontSize: 12, color: '#888' }}>{fmtDate(from)} — {fmtDate(to)}</span>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e4e4e4', borderRadius: 8, padding: '16px 12px 8px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4, marginBottom: 12 }}>
              {CHART_METRICS.map(m => (
                <button
                  key={m.key}
                  onClick={() => setChartMetric(m.key)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                    border: chartMetric === m.key ? '1.5px solid #005F2C' : '1.5px solid #e4e4e4',
                    background: chartMetric === m.key ? '#005F2C' : '#fff',
                    color: chartMetric === m.key ? '#fff' : '#555',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barCategoryGap="30%" barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#555' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={activeMetric.yFmt} tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<ChartTooltip valueFmt={activeMetric.fmt} />} cursor={{ fill: '#f7f8fa' }} />
                <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                <Bar dataKey="This Period" fill="#005F2C" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Last Year"   fill="#cbd5e1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Store</th>
                  <th>Total Sales</th>
                  <th>vs LY</th>
                  <th>Margin %</th>
                  <th>Avg Txn</th>
                  <th>Discount %</th>
                </tr>
              </thead>
              <tbody>
                {data.stores.map(s => {
                  const avgTxn  = s.avgOrderValue || (s.ordersCount > 0 ? s.totalSales / s.ordersCount : 0)
                  const discPct = s.grossSales > 0 ? Math.abs(s.discounts) / s.grossSales * 100 : 0
                  return (
                    <tr key={s.name}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td style={{ textAlign: 'right' }}>{fmtGbp(s.totalSales)}</td>
                      <td style={{ textAlign: 'right' }}>{vsLY(s.totalSales, s.totalSalesLY)}</td>
                      <td style={{ textAlign: 'right', color: s.grossMargin > 0 ? '#005F2C' : '#aaa' }}>
                        {s.grossMargin > 0 ? `${(s.grossMargin * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{avgTxn > 0 ? fmtGbp(avgTxn) : '—'}</td>
                      <td style={{ textAlign: 'right', color: discPct > 0 ? '#dc2626' : '#aaa' }}>
                        {discPct > 0 ? `${discPct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
                {totals && (
                  <tr style={{ fontWeight: 700, background: '#f7f8fa', borderTop: '2px solid #e4e4e4' }}>
                    <td>Total</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(totals.totalSales)}</td>
                    <td style={{ textAlign: 'right' }}>{vsLY(lflCurrent, lflLY)}</td>
                    <td style={{ textAlign: 'right', color: totalMargin > 0 ? '#005F2C' : '#aaa' }}>
                      {totalMargin > 0 ? `${totalMargin.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>{totalAvgTxn > 0 ? fmtGbp(totalAvgTxn) : '—'}</td>
                    <td style={{ textAlign: 'right', color: totalDiscPct > 0 ? '#dc2626' : '#aaa' }}>
                      {totalDiscPct > 0 ? `${totalDiscPct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <TrendSection />
    </div>
  )
}
