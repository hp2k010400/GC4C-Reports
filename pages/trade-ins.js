import React, { useState } from 'react'

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

function fmtGbp(n) {
  return `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const TYPE_ORDER = ['Store Credit', 'Bank Transfer', 'Paypal', 'International']
const STORE_ORDER = ['Edinburgh', 'Milton Keynes', 'Southampton', 'Warrington']
const TYPE_COLORS = {
  'Store Credit': '#005F2C',
  'Bank Transfer': '#3b82f6',
  'Paypal': '#8b5cf6',
  'International': '#f59e0b',
}

function sortedTypes(byType) {
  const all = Object.keys(byType)
  return [...TYPE_ORDER.filter(t => all.includes(t)), ...all.filter(t => !TYPE_ORDER.includes(t))]
}

function sortedStores(byStore) {
  const all = Object.keys(byStore)
  return [...STORE_ORDER.filter(s => all.includes(s)), ...all.filter(s => !STORE_ORDER.includes(s))]
}

function DonutChart({ segments, size = 200 }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null
  const r = 70
  const circumference = 2 * Math.PI * r
  const cx = size / 2
  const cy = size / 2
  const gap = 2

  let cumulative = 0
  const slices = segments.map(seg => {
    const pct = seg.value / total
    const dash = Math.max(0, pct * circumference - gap)
    const rotation = -90 + (cumulative / total) * 360
    cumulative += seg.value
    return { ...seg, dash, rotation, pct: (pct * 100).toFixed(1) }
  })

  const sc = segments.find(s => s.label === 'Store Credit')
  const scPct = sc ? ((sc.value / total) * 100).toFixed(1) : '0'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={32}
          strokeDasharray={`${s.dash} ${circumference}`}
          transform={`rotate(${s.rotation}, ${cx}, ${cy})`}
        />
      ))}
      <text x={cx} y={cy - 10} textAnchor="middle" fontSize={28} fontWeight={700} fill="#005F2C">{scPct}%</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={12} fill="#666">Store Credit</text>
    </svg>
  )
}

export default function TradeInsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [startDate, setStartDate] = useState(daysAgo(89))
  const [endDate, setEndDate] = useState(today())

  async function loadData() {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      const res = await fetch(`/api/trade-in-split-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const dayCount = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1

  return (
    <div className="container-xl">
      <div className="page-title">Trade-Ins</div>
      <div className="page-sub">
        Payment method split for in-store trade-ins. Store Credit from Shopify gift cards; all other methods from the payment form.
      </div>

      <div className="date-presets">
        {[
          { label: '30 days', n: 29 },
          { label: '90 days', n: 89 },
          { label: '180 days', n: 179 },
          { label: '1 year', n: 364 },
        ].map(p => (
          <button key={p.label} className="preset-btn" onClick={() => { setStartDate(daysAgo(p.n)); setEndDate(today()) }}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="load-bar">
        <div className="field">
          <label>From</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={endDate} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} max={today()} />
        </div>
        {startDate && endDate && <div className="date-range-label">{dayCount} days</div>}
        <button className="btn btn-primary" onClick={loadData} disabled={loading}>
          {loading ? 'Loading…' : data ? 'Reload' : 'Load Trade-Ins'}
        </button>
      </div>

      {loading && (
        <div className="state-box">
          <div className="spinner" />
          <div style={{ fontWeight: 500 }}>Fetching payment form and Shopify data…</div>
        </div>
      )}

      {error && <div className="state-box error">Error: {error}</div>}

      {data && !loading && (() => {
        const types = sortedTypes(data.byType)
        const chartSegments = types.map(t => ({
          label: t,
          value: data.byType[t].count,
          color: TYPE_COLORS[t] || '#94a3b8',
        }))

        return (
          <>
            {/* Stat cards */}
            <div className="stats-bar">
              <div className="stat-card">
                <div className="stat-label">Total Trade-Ins</div>
                <div className="stat-value">{data.global.totalCount.toLocaleString()}</div>
              </div>
              <div className="stat-card" style={{ background: '#eaf6f0', borderColor: '#b8dfc9' }}>
                <div className="stat-label" style={{ color: '#005F2C' }}>Store Credit</div>
                <div className="stat-value" style={{ color: '#005F2C' }}>
                  {data.global.storeCreditCount.toLocaleString()}
                  <span style={{ fontSize: 15, fontWeight: 400, marginLeft: 8 }}>({data.global.storeCreditPct}%)</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Paid Out</div>
                <div className="stat-value">{data.global.paidOutCount.toLocaleString()}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Store Credit Value</div>
                <div className="stat-value">{fmtGbp(data.global.storeCreditTotal)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Paid Out Value</div>
                <div className="stat-value">{fmtGbp(data.global.paidOutTotal)}</div>
              </div>
            </div>

            {/* Chart + legend */}
            <div style={{ display: 'flex', gap: 48, alignItems: 'center', margin: '32px 0', flexWrap: 'wrap' }}>
              <DonutChart segments={chartSegments} size={200} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {types.map(t => {
                  const entry = data.byType[t]
                  const pct = data.global.totalCount > 0
                    ? ((entry.count / data.global.totalCount) * 100).toFixed(1)
                    : '0.0'
                  return (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: TYPE_COLORS[t] || '#94a3b8', flexShrink: 0 }} />
                      <div style={{ minWidth: 120, fontWeight: 500 }}>{t}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{entry.count}</div>
                      <div style={{ fontSize: 13, color: '#888', minWidth: 48 }}>{pct}%</div>
                      <div style={{ fontSize: 13, color: '#555' }}>{fmtGbp(entry.total)}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Per-store breakdown */}
            {Object.keys(data.byStore).length > 0 && (
              <>
                <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Per Store — Payment Method Split
                </div>
                <div className="table-wrap">
                  <table className="table-compact">
                    <thead>
                      <tr>
                        <th>Store</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right', color: '#005F2C' }}>Store Credit</th>
                        <th style={{ textAlign: 'right' }}>% Store Credit</th>
                        <th style={{ textAlign: 'right' }}>Bank Transfer</th>
                        <th style={{ textAlign: 'right' }}>PayPal</th>
                        <th style={{ textAlign: 'right' }}>International</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedStores(data.byStore).map(store => {
                        const s = data.byStore[store]
                        const sc = s['Store Credit'] || { count: 0, total: 0 }
                        const bt = s['Bank Transfer'] || { count: 0, total: 0 }
                        const pp = s['Paypal'] || { count: 0, total: 0 }
                        const intl = s['International'] || { count: 0, total: 0 }
                        const storeTotal = Object.values(s).reduce((sum, t) => sum + t.count, 0)
                        const storeTotalVal = Object.values(s).reduce((sum, t) => sum + t.total, 0)
                        const scPct = storeTotal > 0 ? ((sc.count / storeTotal) * 100).toFixed(1) : '0.0'
                        return (
                          <tr key={store}>
                            <td style={{ fontWeight: 500 }}>{store}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                              {storeTotal.toLocaleString()}
                              <div style={{ fontSize: 11, color: '#888' }}>{fmtGbp(storeTotalVal)}</div>
                            </td>
                            <td style={{ textAlign: 'right', color: '#005F2C', fontWeight: 600 }}>
                              {sc.count > 0 ? (<>{sc.count.toLocaleString()}<div style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>{fmtGbp(sc.total)}</div></>) : <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                <div style={{ width: 60, height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ width: `${scPct}%`, height: '100%', background: '#005F2C', borderRadius: 3 }} />
                                </div>
                                <span style={{ minWidth: 40, fontWeight: 700, color: parseFloat(scPct) >= 30 ? '#005F2C' : '#444' }}>{scPct}%</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {bt.count > 0 ? (<>{bt.count.toLocaleString()}<div style={{ fontSize: 11, color: '#888' }}>{fmtGbp(bt.total)}</div></>) : <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {pp.count > 0 ? (<>{pp.count.toLocaleString()}<div style={{ fontSize: 11, color: '#888' }}>{fmtGbp(pp.total)}</div></>) : <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {intl.count > 0 ? (<>{intl.count.toLocaleString()}<div style={{ fontSize: 11, color: '#888' }}>{fmtGbp(intl.total)}</div></>) : <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )
      })()}
    </div>
  )
}
