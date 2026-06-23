import { useState, useEffect, useMemo, useCallback } from 'react'

const NAMES_KEY = 'gc4c_staff_names'

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

function loadNames() {
  try { return JSON.parse(localStorage.getItem(NAMES_KEY) || '{}') } catch { return {} }
}

function saveName(userId, name) {
  const names = loadNames()
  if (name.trim()) names[userId] = name.trim()
  else delete names[userId]
  localStorage.setItem(NAMES_KEY, JSON.stringify(names))
}

function StaffName({ userId, names, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(names[userId] || '')

  function commit() {
    saveName(userId, val)
    setEditing(false)
    onSaved()
  }

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          style={{ fontSize: 13, padding: '3px 8px', border: '1.5px solid #005F2C', borderRadius: 5, outline: 'none', width: 140 }}
        />
        <button onClick={commit} style={{ background: '#005F2C', color: 'white', border: 'none', borderRadius: 5, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}>Save</button>
        <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
      </span>
    )
  }

  const name = names[userId]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {name
        ? <span style={{ fontWeight: 500 }}>{name}</span>
        : <span style={{ color: '#aaa', fontStyle: 'italic' }}>Staff #{userId}</span>
      }
      <button
        onClick={() => { setVal(name || ''); setEditing(true) }}
        title="Name this person"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', padding: 0, lineHeight: 1 }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </span>
  )
}

export default function FulfillmentsPage() {
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)
  const [names, setNames] = useState({})

  const bounds = useMemo(() => getDateBounds(), [])

  useEffect(() => { setNames(loadNames()) }, [])

  const refreshNames = useCallback(() => setNames(loadNames()), [])

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

  const { totals, staffStats, userIds, monthRows } = useMemo(() => {
    if (!rows) return { totals: { today: 0, week: 0, month: 0 }, staffStats: {}, userIds: [], monthRows: [] }

    const { todayStr, weekStart, monthStart } = bounds
    const totals = { today: 0, week: 0, month: 0 }
    const staffStats = {}

    for (const r of rows) {
      if (!staffStats[r.userId]) staffStats[r.userId] = { today: 0, week: 0, month: 0 }
      if (r.date === todayStr) { totals.today += r.count; staffStats[r.userId].today += r.count }
      if (r.date >= weekStart) { totals.week += r.count; staffStats[r.userId].week += r.count }
      if (r.date >= monthStart) { totals.month += r.count; staffStats[r.userId].month += r.count }
    }

    const userIds = Object.keys(staffStats).sort((a, b) =>
      staffStats[b].month - staffStats[a].month
    )

    const monthRows = rows.filter(r => r.date >= monthStart)

    return { totals, staffStats, userIds, monthRows }
  }, [rows, bounds])

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <div className="page-title">Orders Fulfilled</div>
          <div className="page-sub" style={{ marginBottom: 0 }}>
            Fulfilled orders by staff member — today, this week, and this month
          </div>
        </div>
        <button className="btn" onClick={load} disabled={loading} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="state-box error" style={{ marginBottom: 20 }}>{error}</div>}

      {/* Overall totals */}
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 28 }}>
        <div className="stat-card">
          <div className="stat-value">{loading && !rows ? '—' : totals.today.toLocaleString()}</div>
          <div className="stat-label">Today</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>{fmtDate(bounds.todayStr)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading && !rows ? '—' : totals.week.toLocaleString()}</div>
          <div className="stat-label">This Week</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>{fmtDate(bounds.weekStart)} – {fmtDate(bounds.todayStr)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading && !rows ? '—' : totals.month.toLocaleString()}</div>
          <div className="stat-label">This Month</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>{fmtDate(bounds.monthStart)} – {fmtDate(bounds.todayStr)}</div>
        </div>
      </div>

      {/* Per-staff breakdown */}
      {rows && userIds.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 24 }}>
          <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="section-label">By staff member</div>
            {fetchedAt && (
              <span style={{ fontSize: 12, color: '#aaa' }}>
                Updated {fetchedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>Staff Member</th>
                <th style={{ textAlign: 'right' }}>Today</th>
                <th style={{ textAlign: 'right' }}>This Week</th>
                <th style={{ textAlign: 'right' }}>This Month</th>
              </tr>
            </thead>
            <tbody>
              {userIds.map(userId => (
                <tr key={userId}>
                  <td>
                    <StaffName userId={userId} names={names} onSaved={refreshNames} />
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{staffStats[userId].today || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{staffStats[userId].week}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{staffStats[userId].month}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #e4e4e4' }}>
                <td style={{ fontWeight: 700, color: '#111' }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{totals.today || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{totals.week}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{totals.month}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Daily breakdown this month */}
      {rows && monthRows.length > 0 && (
        <div className="table-wrap">
          <div style={{ padding: '14px 16px 0' }}>
            <div className="section-label">Daily breakdown — this month</div>
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
              {monthRows.map((r, i) => (
                <tr key={`${r.date}-${r.userId}`}>
                  <td>{fmtDay(r.date)}</td>
                  <td>{names[r.userId] || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Staff #{r.userId}</span>}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.count}</td>
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
