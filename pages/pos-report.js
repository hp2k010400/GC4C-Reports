import React, { useState } from 'react'

const fmtGbp = n => `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = n => `${(n || 0).toFixed(1)}%`

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
  const [from, setFrom]     = useState(defaults.from)
  const [to, setTo]         = useState(defaults.to)
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const [emailing, setEmailing] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  async function loadData() {
    setLoading(true)
    setError(null)
    setData(null)
    setEmailSent(false)
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

  async function sendEmail() {
    setEmailing(true)
    try {
      await fetch(`/api/test-pos-email?secret=${process.env.NEXT_PUBLIC_ACTION_SECRET || 'gc4c-test-2026'}&from=${from}&to=${to}&solo=1`)
      setEmailSent(true)
    } catch (e) {
      // silently fail
    } finally {
      setEmailing(false)
    }
  }

  const th = { padding: '9px 14px', background: '#f8f9fa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#555', borderBottom: '2px solid #e4e4e4', textAlign: 'right', whiteSpace: 'nowrap' }
  const thL = { ...th, textAlign: 'left' }
  const td = { padding: '10px 14px', borderBottom: '1px solid #eee', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }
  const tdL = { ...td, textAlign: 'left', fontWeight: 600 }
  const tdT = { ...td, fontWeight: 700, background: '#f7f8fa', borderTop: '2px solid #e4e4e4', borderBottom: 'none' }
  const tdTL = { ...tdT, textAlign: 'left' }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>POS Sales Report</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
        Generate a store performance report for any date range. Numbers pull directly from Shopify Analytics.
      </p>

      {/* Date picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#444' }}>From</label>
        <input
          type="date"
          value={from}
          onChange={e => setFrom(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
        />
        <label style={{ fontSize: 13, fontWeight: 600, color: '#444' }}>To</label>
        <input
          type="date"
          value={to}
          onChange={e => setTo(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
        />
        <button
          onClick={loadData}
          disabled={loading}
          style={{ background: '#005F2C', color: 'white', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Loading…' : 'Generate Report'}
        </button>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>Error: {error}</p>}

      {data && (
        <>
          <div style={{ background: '#005F2C', borderRadius: '8px 8px 0 0', padding: '14px 20px', marginBottom: 0 }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>GC4C POS Performance</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>
              {fmtDate(from)} — {fmtDate(to)}
            </div>
          </div>
          <div style={{ background: 'white', borderRadius: '0 0 8px 8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 24, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thL}>Store</th>
                  <th style={th}>Total Sales</th>
                  <th style={th}>vs LY</th>
                  <th style={th}>Gross Sales</th>
                  <th style={th}>Discounts</th>
                  <th style={th}>Net Sales</th>
                  <th style={th}>Taxes</th>
                </tr>
              </thead>
              <tbody>
                {data.stores.map(s => (
                  <tr key={s.name}>
                    <td style={tdL}>{s.name}</td>
                    <td style={td}>{fmtGbp(s.totalSales)}</td>
                    <td style={td}>{vsLY(s.totalSales, s.totalSalesLY)}</td>
                    <td style={td}>{fmtGbp(s.grossSales)}</td>
                    <td style={{ ...td, color: '#dc2626' }}>{fmtGbp(s.discounts)}</td>
                    <td style={td}>{fmtGbp(s.netSales)}</td>
                    <td style={td}>{fmtGbp(s.taxes)}</td>
                  </tr>
                ))}
                {data.totals && (
                  <tr>
                    <td style={tdTL}>Total</td>
                    <td style={tdT}>{fmtGbp(data.totals.totalSales)}</td>
                    <td style={tdT}></td>
                    <td style={tdT}>{fmtGbp(data.totals.grossSales)}</td>
                    <td style={{ ...tdT, color: '#dc2626' }}>{fmtGbp(data.totals.discounts)}</td>
                    <td style={tdT}>{fmtGbp(data.totals.netSales)}</td>
                    <td style={tdT}>{fmtGbp(data.totals.taxes)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={sendEmail}
              disabled={emailing || emailSent}
              style={{ background: emailSent ? '#005F2C' : '#1d4ed8', color: 'white', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: (emailing || emailSent) ? 'not-allowed' : 'pointer', opacity: (emailing || emailSent) ? 0.8 : 1 }}
            >
              {emailSent ? '✓ Email sent to you' : emailing ? 'Sending…' : 'Email me this report'}
            </button>
            <span style={{ fontSize: 12, color: '#888' }}>Sends full POS email to you only</span>
          </div>
        </>
      )}
    </div>
  )
}
