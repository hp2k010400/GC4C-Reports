import { useState, useEffect, useMemo } from 'react'

function getDateBounds() {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const monthStart = todayStr.slice(0, 7) + '-01'

  const dayOfWeek = now.getDay()
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStartMs = now - daysSinceMonday * 86400000
  const weekStart = new Date(weekStartMs).toISOString().slice(0, 10)

  const fetchStart = weekStart < monthStart ? weekStart : monthStart

  return { todayStr, monthStart, weekStart, fetchStart }
}

function fmtDate(d) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtDay(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function FulfillmentsPage() {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)

  const bounds = useMemo(() => getDateBounds(), [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/fulfilled-orders?startDate=${bounds.fetchStart}&endDate=${bounds.todayStr}`
      )
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRows(data.rows)
      setFetchedAt(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const stats = useMemo(() => {
    if (!rows) return { today: 0, week: 0, month: 0 }
    const { todayStr, weekStart, monthStart } = bounds
    let today = 0, week = 0, month = 0
    for (const r of rows) {
      if (r.date === todayStr) today += r.count
      if (r.date >= weekStart) week += r.count
      if (r.date >= monthStart) month += r.count
    }
    return { today, week, month }
  }, [rows, bounds])

  const monthRows = useMemo(() => {
    if (!rows) return []
    return rows.filter(r => r.date >= bounds.monthStart)
  }, [rows, bounds])

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <div className="page-title">Orders Fulfilled</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>
            Total fulfilled orders — today, this week, and this month
          </div>
        </div>
        <button
          className="btn"
          onClick={load}
          disabled={loading}
          style={{ alignSelf: 'flex-start', marginTop: 4 }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="state-box error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 32 }}>
        <div className="stat-card">
          <div className="stat-value">{loading && !rows ? '—' : stats.today.toLocaleString()}</div>
          <div className="stat-label">Today</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>{fmtDate(bounds.todayStr)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading && !rows ? '—' : stats.week.toLocaleString()}</div>
          <div className="stat-label">This Week</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>
            {fmtDate(bounds.weekStart)} – {fmtDate(bounds.todayStr)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading && !rows ? '—' : stats.month.toLocaleString()}</div>
          <div className="stat-label">This Month</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>
            {fmtDate(bounds.monthStart)} – {fmtDate(bounds.todayStr)}
          </div>
        </div>
      </div>

      {rows && monthRows.length > 0 && (
        <div className="table-wrap">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="section-label">Daily breakdown — this month</div>
            {fetchedAt && (
              <span style={{ fontSize: 12, color: '#aaa' }}>
                Updated {fetchedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Orders Fulfilled</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map(r => (
                <tr key={r.date}>
                  <td>{fmtDay(r.date)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows && monthRows.length === 0 && !loading && (
        <div style={{ color: '#888', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
          No fulfilled orders found for this month.
        </div>
      )}

      {loading && !rows && (
        <div className="state-box">
          <div className="spinner" />
          <div>Loading fulfilled orders…</div>
        </div>
      )}
    </div>
  )
}
