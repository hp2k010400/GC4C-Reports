import React, { useState } from 'react'

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

export default function WishlistAnalyticsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [startDate, setStartDate] = useState(daysAgo(29))
  const [endDate, setEndDate] = useState(today())

  async function loadData() {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      const res = await fetch(`/api/wishlist-analytics-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-xl">
      <div className="page-title">Wishlist Analytics</div>
      <div className="page-sub">Add/remove activity from the custom wishlist, by product.</div>

      <div className="date-presets">
        {[
          { label: '30 days', n: 29 },
          { label: '90 days', n: 89 },
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
        <button className="btn btn-primary" onClick={loadData} disabled={loading}>
          {loading ? 'Loading…' : data ? 'Reload' : 'Load Analytics'}
        </button>
      </div>

      {loading && (
        <div className="state-box">
          <div className="spinner" />
          <div style={{ fontWeight: 500 }}>Fetching wishlist activity…</div>
        </div>
      )}

      {error && <div className="state-box error">Error: {error}</div>}

      {data && !loading && (
        <>
          <div className="stats-bar">
            <div className="stat-card">
              <div className="stat-label">Currently Wishlisted</div>
              <div className="stat-value">{data.summary.currentlyWishlisted.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Adds (period)</div>
              <div className="stat-value" style={{ color: '#005F2C' }}>{data.summary.totalAdds.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Removes (period)</div>
              <div className="stat-value" style={{ color: '#d97706' }}>{data.summary.totalRemoves.toLocaleString()}</div>
            </div>
          </div>

          {data.topProducts.length === 0 ? (
            <div className="state-box">No wishlist activity in this period.</div>
          ) : (
            <div className="table-wrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Adds</th>
                    <th style={{ textAlign: 'right' }}>Removes</th>
                    <th style={{ textAlign: 'right' }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map(p => (
                    <tr key={p.productId}>
                      <td>
                        {p.handle ? (
                          <a href={`https://golfclubs4cash.co.uk/products/${p.handle}`} target="_blank" rel="noreferrer">
                            {p.title}
                          </a>
                        ) : p.title}
                      </td>
                      <td style={{ textAlign: 'right' }}>{p.adds}</td>
                      <td style={{ textAlign: 'right' }}>{p.removes}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.net}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
