import React, { useState } from 'react'

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

const STORE_ORDER = ['Edinburgh', 'Milton Keynes', 'Southampton', 'Warrington']

function fmtGbp(n) {
  return `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function buildCSV(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [headers.join(','), ...rows.map(r => headers.map(h => {
    const v = String(r[h] ?? '')
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
  }).join(','))].join('\n')
}

function downloadCSV(rows, filename) {
  const blob = new Blob([buildCSV(rows)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function GripSalesPage() {
  const [startDate, setStartDate] = useState(daysAgo(29))
  const [endDate, setEndDate]     = useState(today())
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [progress, setProgress]   = useState(0)
  const [error, setError]         = useState(null)
  const [showRows, setShowRows]   = useState(false)

  async function loadData() {
    setLoading(true)
    setError(null)
    setData(null)
    setProgress(0)
    setShowRows(false)

    let accPosQty = 0, accPosRevenue = 0
    let accGripQty = 0, accGripRevenue = 0
    const accByStore = {}
    let accGripRows = []

    try {
      // Phase 1: get locations list
      const locRes = await fetch(`/api/grip-sales-data?startDate=${startDate}&endDate=${endDate}`)
      const locJson = await locRes.json()
      if (!locRes.ok) throw new Error(locJson.error)

      // Phase 2: paginate orders per location
      for (const loc of locJson.locations) {
        let cursor = null
        do {
          const params = new URLSearchParams({ startDate, endDate, locationId: String(loc.id), ...(cursor ? { cursor } : {}) })
          const res = await fetch(`/api/grip-sales-data?${params}`)
          const json = await res.json()
          if (!res.ok) throw new Error(json.error)

          const p = json.partial
          accPosQty     += p.posQty
          accPosRevenue += p.posRevenue
          accGripQty    += p.gripQty
          accGripRevenue += p.gripRevenue

          if (!accByStore[p.store]) accByStore[p.store] = { posQty: 0, posRevenue: 0, gripQty: 0, gripRevenue: 0 }
          accByStore[p.store].posQty      += p.posQty
          accByStore[p.store].posRevenue  += p.posRevenue
          accByStore[p.store].gripQty     += p.gripQty
          accByStore[p.store].gripRevenue += p.gripRevenue

          accGripRows = accGripRows.concat(json.gripRows)
          setProgress(accPosQty)
          cursor = json.nextCursor
        } while (cursor)
      }

      const byStore = [
        ...STORE_ORDER.filter(s => accByStore[s]),
        ...Object.keys(accByStore).filter(s => !STORE_ORDER.includes(s)),
      ].map(store => {
        const d = accByStore[store]
        return {
          store,
          gripQty:    d.gripQty,
          gripRevenue: parseFloat(d.gripRevenue.toFixed(2)),
          posQty:     d.posQty,
          posRevenue: parseFloat(d.posRevenue.toFixed(2)),
          pctQty:     d.posQty     > 0 ? parseFloat(((d.gripQty     / d.posQty)     * 100).toFixed(1)) : 0,
          pctRevenue: d.posRevenue > 0 ? parseFloat(((d.gripRevenue / d.posRevenue) * 100).toFixed(1)) : 0,
        }
      })

      setData({
        summary: {
          totalGripQty:    accGripQty,
          totalGripRevenue: parseFloat(accGripRevenue.toFixed(2)),
          totalPosQty:     accPosQty,
          totalPosRevenue: parseFloat(accPosRevenue.toFixed(2)),
          pctQty:     accPosQty     > 0 ? parseFloat(((accGripQty     / accPosQty)     * 100).toFixed(1)) : 0,
          pctRevenue: accPosRevenue > 0 ? parseFloat(((accGripRevenue / accPosRevenue) * 100).toFixed(1)) : 0,
        },
        byStore,
        rows: accGripRows,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function quickDate(preset) {
    const d = new Date()
    if (preset === 'today') {
      setStartDate(today()); setEndDate(today())
    } else if (preset === 'week') {
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
      setStartDate(new Date(d - dow * 86400000).toISOString().slice(0, 10)); setEndDate(today())
    } else if (preset === 'month') {
      setStartDate(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)); setEndDate(today())
    } else {
      setStartDate(daysAgo(29)); setEndDate(today())
    }
  }

  const s = data?.summary

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Grip Sales — POS</h1>
          <p className="page-sub">Golf Club Grips sold in-store, as a % of total POS items and revenue</p>
        </div>
      </div>

      <div className="controls">
        <div className="field">
          <label>From</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={loadData} disabled={loading}>
          {loading ? `Fetching… (${progress.toLocaleString()} items)` : 'Generate'}
        </button>
        <div className="date-presets" style={{ marginBottom: 0 }}>
          {[['Today', 'today'], ['This Week', 'week'], ['This Month', 'month'], ['Last 30d', '30d']].map(([label, preset]) => (
            <button key={preset} className="preset-btn" onClick={() => quickDate(preset)}>{label}</button>
          ))}
        </div>
      </div>

      {error && (
        <div className="state-box error" style={{ marginBottom: 20 }}>{error}</div>
      )}

      {loading && !data && (
        <div className="state-box">
          <div className="spinner" />
          <div>Scanning POS orders… {progress > 0 && `(${progress.toLocaleString()} items so far)`}</div>
        </div>
      )}

      {data && (
        <>
          {/* Summary stat cards */}
          <div className="stats-bar" style={{ marginBottom: 24 }}>
            <div className="stat-card" style={{ flex: 1, minWidth: 130 }}>
              <div className="stat-label">Grip Units Sold</div>
              <div className="stat-value">{s.totalGripQty}</div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: 130 }}>
              <div className="stat-label">Grip Revenue</div>
              <div className="stat-value">{fmtGbp(s.totalGripRevenue)}</div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: 160 }}>
              <div className="stat-label">% of POS Items</div>
              <div className="stat-value" style={{ color: '#005F2C' }}>{s.pctQty}%</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
                {s.totalGripQty} of {s.totalPosQty.toLocaleString()} units
              </div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: 160 }}>
              <div className="stat-label">% of POS Revenue</div>
              <div className="stat-value" style={{ color: '#005F2C' }}>{s.pctRevenue}%</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
                of {fmtGbp(s.totalPosRevenue)} total
              </div>
            </div>
          </div>

          {/* Per-store breakdown */}
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            By Store
          </h2>
          <div className="table-wrap" style={{ marginBottom: 28 }}>
            <table>
              <thead>
                <tr>
                  <th>Store</th>
                  <th style={{ textAlign: 'right' }}>Grip Units</th>
                  <th style={{ textAlign: 'right' }}>Grip Revenue</th>
                  <th style={{ textAlign: 'right' }}>POS Items</th>
                  <th style={{ textAlign: 'right' }}>POS Revenue</th>
                  <th style={{ textAlign: 'right' }}>% Items</th>
                  <th style={{ textAlign: 'right' }}>% Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.byStore.map(row => (
                  <tr key={row.store}>
                    <td>{row.store}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{row.gripQty}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(row.gripRevenue)}</td>
                    <td style={{ textAlign: 'right', color: '#888' }}>{row.posQty}</td>
                    <td style={{ textAlign: 'right', color: '#888' }}>{fmtGbp(row.posRevenue)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: row.pctQty >= 5 ? '#005F2C' : '#333' }}>
                      {row.pctQty}%
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: row.pctRevenue >= 5 ? '#005F2C' : '#333' }}>
                      {row.pctRevenue}%
                    </td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: '2px solid #e4e4e4', background: '#f7f8fa' }}>
                  <td>Total</td>
                  <td style={{ textAlign: 'right' }}>{s.totalGripQty}</td>
                  <td style={{ textAlign: 'right' }}>{fmtGbp(s.totalGripRevenue)}</td>
                  <td style={{ textAlign: 'right' }}>{s.totalPosQty}</td>
                  <td style={{ textAlign: 'right' }}>{fmtGbp(s.totalPosRevenue)}</td>
                  <td style={{ textAlign: 'right', color: '#005F2C' }}>{s.pctQty}%</td>
                  <td style={{ textAlign: 'right', color: '#005F2C' }}>{s.pctRevenue}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Grip transaction detail */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Grip Transactions ({data.rows.length})
            </h2>
            <button className="btn btn-secondary" onClick={() => setShowRows(v => !v)} style={{ padding: '5px 12px', fontSize: 13 }}>
              {showRows ? 'Hide' : 'Show'}
            </button>
            {data.rows.length > 0 && (
              <button
                className="btn btn-secondary"
                onClick={() => downloadCSV(data.rows, `grip-sales-${startDate}-${endDate}.csv`)}
                style={{ padding: '5px 12px', fontSize: 13 }}
              >
                Export CSV
              </button>
            )}
          </div>

          {showRows && (
            data.rows.length === 0
              ? <p style={{ color: '#888', fontSize: 14 }}>No grip sales in this period.</p>
              : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Store</th>
                        <th>Order</th>
                        <th>Product</th>
                        <th>SKU</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Unit Price</th>
                        <th style={{ textAlign: 'right' }}>Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row, i) => (
                        <tr key={i}>
                          <td>{row.Date}</td>
                          <td>{row.Store}</td>
                          <td>{row.Order}</td>
                          <td style={{ maxWidth: 280 }}>{row.Product}</td>
                          <td className="sku-cell">{row.SKU}</td>
                          <td style={{ textAlign: 'right' }}>{row.Qty}</td>
                          <td style={{ textAlign: 'right' }}>{fmtGbp(parseFloat(row['Unit Price']))}</td>
                          <td style={{ textAlign: 'right' }}>{fmtGbp(parseFloat(row['Line Total']))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}
        </>
      )}
    </div>
  )
}
