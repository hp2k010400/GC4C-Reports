import { useState, useEffect, useMemo } from 'react'

const AVATAR_COLORS = ['#005F2C', '#1a6b8a', '#7b2d8b', '#c0392b', '#d4860a', '#2e86ab', '#a23b72', '#16a085']

function avatarColor(name) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initials(name) {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function getDateBounds() {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const monthStart = todayStr.slice(0, 7) + '-01'
  const dayOfWeek = now.getDay()
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStart = new Date(now - daysSinceMonday * 86400000).toISOString().slice(0, 10)
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

function StatPill({ label, value }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#111', letterSpacing: '-0.5px', lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 5 }}>
        {label}
      </div>
    </div>
  )
}

function StaffCard({ author, stats }) {
  const color = avatarColor(author)
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e8e8e8',
      borderRadius: 12,
      padding: '20px 22px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: color, color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, flexShrink: 0, letterSpacing: '0.02em',
        }}>
          {initials(author)}
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#111', lineHeight: 1.3 }}>{author}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
        <StatPill label="Today" value={stats.today || 0} />
        <div style={{ width: 1, background: '#f0f0f0' }} />
        <StatPill label="This Week" value={stats.week} />
        <div style={{ width: 1, background: '#f0f0f0' }} />
        <StatPill label="This Month" value={stats.month} />
      </div>
    </div>
  )
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
      const res = await fetch(`/api/fulfilled-orders?startDate=${bounds.fetchStart}&endDate=${bounds.todayStr}`)
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

  const { totals, staffStats, staffList, monthRows } = useMemo(() => {
    if (!rows) return { totals: { today: 0, week: 0, month: 0 }, staffStats: {}, staffList: [], monthRows: [] }

    const { todayStr, weekStart, monthStart } = bounds
    const totals = { today: 0, week: 0, month: 0 }
    const staffStats = {}

    for (const r of rows) {
      if (!staffStats[r.author]) staffStats[r.author] = { today: 0, week: 0, month: 0 }
      if (r.date === todayStr) { totals.today += r.count; staffStats[r.author].today += r.count }
      if (r.date >= weekStart)  { totals.week  += r.count; staffStats[r.author].week  += r.count }
      if (r.date >= monthStart) { totals.month += r.count; staffStats[r.author].month += r.count }
    }

    const staffList = Object.keys(staffStats).sort((a, b) => staffStats[b].month - staffStats[a].month)
    const monthRows = rows.filter(r => r.date >= monthStart)

    return { totals, staffStats, staffList, monthRows }
  }, [rows, bounds])

  const monthStr = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="container">

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Fulfillments</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>
            Orders dispatched by staff — {monthStr}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {fetchedAt && (
            <span style={{ fontSize: 12, color: '#aaa' }}>
              Updated {fetchedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="state-box error" style={{ marginBottom: 24 }}>{error}</div>}

      {/* Overall totals */}
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 32 }}>
        <div className="stat-card">
          <div className="stat-value">{loading && !rows ? '—' : totals.today}</div>
          <div className="stat-label">Today</div>
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>{fmtDate(bounds.todayStr)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading && !rows ? '—' : totals.week}</div>
          <div className="stat-label">This Week</div>
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>{fmtDate(bounds.weekStart)} – {fmtDate(bounds.todayStr)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading && !rows ? '—' : totals.month}</div>
          <div className="stat-label">This Month</div>
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>{fmtDate(bounds.monthStart)} – {fmtDate(bounds.todayStr)}</div>
        </div>
      </div>

      {/* Staff cards */}
      {rows && staffList.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div className="section-label" style={{ marginBottom: 14 }}>By staff member</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {staffList.map(author => (
              <StaffCard key={author} author={author} stats={staffStats[author]} />
            ))}
          </div>
        </div>
      )}

      {/* Daily breakdown table */}
      {rows && monthRows.length > 0 && (
        <div className="table-wrap">
          <div style={{ padding: '14px 16px 0' }}>
            <div className="section-label">Daily breakdown — {monthStr}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Staff Member</th>
                <th style={{ textAlign: 'right' }}>Orders Fulfilled</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map(r => (
                <tr key={`${r.date}-${r.author}`}>
                  <td style={{ color: '#666', whiteSpace: 'nowrap' }}>{fmtDay(r.date)}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: avatarColor(r.author), color: 'white',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, flexShrink: 0,
                      }}>
                        {initials(r.author)}
                      </span>
                      {r.author}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows && monthRows.length === 0 && !loading && (
        <div className="state-box">No fulfilled orders found for this month.</div>
      )}

      {loading && !rows && (
        <div className="state-box">
          <div className="spinner" />
          <div>Loading fulfillments…</div>
        </div>
      )}

    </div>
  )
}
