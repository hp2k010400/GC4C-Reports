import React, { useState } from 'react'

const fmtGbp = n => `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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

export default function POSReportPage() {
  const defaults = getLastWeekDates()
  const [from, setFrom]       = useState(defaults.from)
  const [to, setTo]           = useState(defaults.to)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

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
    totalSales: acc.totalSales + (s.totalSales || 0),
    grossSales: acc.grossSales + (s.grossSales || 0),
    discounts:  acc.discounts  + (s.discounts  || 0),
    netSales:   acc.netSales   + (s.netSales   || 0),
    taxes:      acc.taxes      + (s.taxes      || 0),
  }), { totalSales: 0, grossSales: 0, discounts: 0, netSales: 0, taxes: 0 })

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
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              By Store
            </h2>
            <span style={{ fontSize: 12, color: '#888' }}>{fmtDate(from)} — {fmtDate(to)}</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Store</th>
                  <th>Total Sales</th>
                  <th>vs LY</th>
                  <th>Gross Sales</th>
                  <th style={{ color: '#dc2626' }}>Discounts</th>
                  <th>Net Sales</th>
                  <th>Taxes</th>
                  <th>Margin %</th>
                </tr>
              </thead>
              <tbody>
                {data.stores.map(s => (
                  <tr key={s.name}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(s.totalSales)}</td>
                    <td style={{ textAlign: 'right' }}>{vsLY(s.totalSales, s.totalSalesLY)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(s.grossSales)}</td>
                    <td style={{ textAlign: 'right', color: '#dc2626' }}>{fmtGbp(s.discounts)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(s.netSales)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(s.taxes)}</td>
                    <td style={{ textAlign: 'right', color: s.grossMargin > 0 ? '#005F2C' : '#aaa' }}>
                      {s.grossMargin > 0 ? `${(s.grossMargin * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
                {totals && (
                  <tr style={{ fontWeight: 700, background: '#f7f8fa', borderTop: '2px solid #e4e4e4' }}>
                    <td>Total</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(totals.totalSales)}</td>
                    <td></td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(totals.grossSales)}</td>
                    <td style={{ textAlign: 'right', color: '#dc2626' }}>{fmtGbp(totals.discounts)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(totals.netSales)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(totals.taxes)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
