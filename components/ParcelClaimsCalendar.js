import { useState, useEffect, useCallback, useRef } from 'react'
import { fmtDate, today } from '../lib/parcelClaims'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function monthLabel(d) {
  return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

// Full grid of dates covering the month, padded with the trailing days of
// the previous month and leading days of the next so every week row is a
// full 7 days (Monday start).
function buildGrid(d) {
  const year = d.getFullYear()
  const month = d.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startOffset = (firstOfMonth.getDay() + 6) % 7 // Mon=0 ... Sun=6
  const gridStart = new Date(year, month, 1 - startOffset)

  const days = []
  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart)
    day.setDate(gridStart.getDate() + i)
    days.push(day)
  }
  // Trim trailing all-next-month rows once the month's fully covered.
  while (days.length > 35 && days[days.length - 7].getMonth() !== month) {
    days.splice(days.length - 7, 7)
  }
  return days
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function emptyForm() {
  return { title: '', due_date: today(), notes: '', claim_id: '', claim_label: '' }
}

export default function ParcelClaimsCalendar() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [rows, setRows] = useState([])
  const [overdueCount, setOverdueCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addError, setAddError] = useState(null)

  const [claimResults, setClaimResults] = useState([])
  const claimSearchDebounce = useRef(null)

  const grid = buildGrid(cursor)
  const monthStart = isoDate(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
  const monthEnd = isoDate(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Widen the fetch to the full grid (incl. the padded lead/trail days
      // from neighbouring months) so a reminder sat on one of those visible
      // cells isn't missing.
      const from = isoDate(grid[0])
      const to = isoDate(grid[grid.length - 1])
      const res = await fetch(`/api/parcel-claims/reminders?from=${from}&to=${to}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load reminders')
      setRows(data.rows || [])
      setOverdueCount(data.overdueCount || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [monthStart, monthEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  function changeMonth(delta) {
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  }

  function searchClaims(q) {
    clearTimeout(claimSearchDebounce.current)
    if (!q.trim()) { setClaimResults([]); return }
    claimSearchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/parcel-claims?search=${encodeURIComponent(q.trim())}&closed=1&limit=8`)
        const data = await res.json()
        if (res.ok) setClaimResults(data.rows || [])
      } catch {}
    }, 300)
  }

  function pickClaim(row) {
    setForm(f => ({ ...f, claim_id: row.id, claim_label: `${row.customer_name}${row.consignment_ref ? ` — ${row.consignment_ref}` : ''}` }))
    setClaimResults([])
  }

  async function handleAddSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.due_date) return
    setAddSubmitting(true)
    setAddError(null)
    try {
      const res = await fetch('/api/parcel-claims/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, due_date: form.due_date, notes: form.notes, claim_id: form.claim_id || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setForm(emptyForm())
      setShowAddForm(false)
      load()
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAddSubmitting(false)
    }
  }

  async function toggleDone(row) {
    try {
      const res = await fetch(`/api/parcel-claims/reminders/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !row.done }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      setRows(rs => row.done ? rs.filter(r => r.id !== row.id) : rs.map(r => r.id === row.id ? data.row : r))
      if (!row.done) setOverdueCount(c => row.due_date < today() ? Math.max(0, c - 1) : c)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteReminder(row) {
    if (!confirm(`Delete reminder "${row.title}"?`)) return
    try {
      const res = await fetch(`/api/parcel-claims/reminders/${row.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setRows(rs => rs.filter(r => r.id !== row.id))
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const todayStr = today()
  const overdueRows = rows.filter(r => !r.done && r.due_date < todayStr)
  const byDay = {}
  for (const r of rows) {
    (byDay[r.due_date] || (byDay[r.due_date] = [])).push(r)
  }

  return (
    <div>
      {error && <div className="state-box error" style={{ marginBottom: 16 }}>Error: {error}</div>}

      {overdueRows.length > 0 && (
        <div className="state-box error" style={{ marginBottom: 16, textAlign: 'left' }}>
          <strong>{overdueRows.length} reminder{overdueRows.length === 1 ? '' : 's'} overdue</strong>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {overdueRows.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => toggleDone(r)}>Mark done</button>
                <span>{fmtDate(r.due_date)} — {r.title}{r.parcel_claims && <span style={{ color: '#888' }}> ({r.parcel_claims.customer_name})</span>}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="filter-builder-header" style={{ marginBottom: 12 }}>
        <button className="btn btn-secondary" onClick={() => changeMonth(-1)}>‹</button>
        <div style={{ fontWeight: 700, fontSize: 15, minWidth: 160, textAlign: 'center' }}>{monthLabel(cursor)}</div>
        <button className="btn btn-secondary" onClick={() => changeMonth(1)}>›</button>
        <button className="btn btn-secondary" onClick={() => setCursor(() => { const d = new Date(); d.setDate(1); return d })}>Today</button>
        <button className="add-filter-btn" style={{ marginLeft: 'auto' }} onClick={() => setShowAddForm(s => !s)}>
          {showAddForm ? '× Close' : '+ Add Reminder'}
        </button>
      </div>

      {showAddForm && (
        <form className="filter-builder" onSubmit={handleAddSubmit} style={{ gap: 12, marginBottom: 16 }}>
          <div className="chart-card-title">New Reminder</div>
          <div className="filter-row">
            <input className="form-input" placeholder="What's it for? *" required style={{ minWidth: 220 }} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <input className="form-input" type="date" style={{ maxWidth: 150 }} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </div>
          <div className="filter-row" style={{ position: 'relative' }}>
            <input
              className="form-input"
              placeholder="Link to a claim? (optional — search name/consignment/claim ref)"
              style={{ minWidth: 320 }}
              value={form.claim_label}
              onChange={e => { setForm(f => ({ ...f, claim_id: '', claim_label: e.target.value })); searchClaims(e.target.value) }}
            />
            {form.claim_id && (
              <button type="button" className="filter-remove" onClick={() => setForm(f => ({ ...f, claim_id: '', claim_label: '' }))} title="Unlink claim">×</button>
            )}
            {claimResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10, background: '#fff', border: '1px solid #e4e4e4', borderRadius: 6, marginTop: 2, minWidth: 320, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                {claimResults.map(c => (
                  <div
                    key={c.id}
                    onClick={() => pickClaim(c)}
                    style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                    onMouseDown={e => e.preventDefault()}
                  >
                    {c.customer_name}{c.consignment_ref ? ` — ${c.consignment_ref}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
          <textarea className="form-input" placeholder="Notes (optional)" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="filter-row">
            <button className="btn btn-primary" type="submit" disabled={addSubmitting || !form.title.trim()}>
              {addSubmitting ? 'Saving…' : 'Save Reminder'}
            </button>
            {addError && <span style={{ color: '#dc2626', fontSize: 13 }}>{addError}</span>}
          </div>
        </form>
      )}

      {loading ? (
        <div className="state-box"><div className="spinner" />Loading calendar…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#e4e4e4', border: '1px solid #e4e4e4', borderRadius: 8, overflow: 'hidden' }}>
          {WEEKDAYS.map(w => (
            <div key={w} style={{ background: '#f7f7f8', padding: '6px 8px', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>{w}</div>
          ))}
          {grid.map(d => {
            const iso = isoDate(d)
            const inMonth = d.getMonth() === cursor.getMonth()
            const isToday = iso === todayStr
            const dayReminders = byDay[iso] || []
            return (
              <div
                key={iso}
                style={{
                  background: '#fff', minHeight: 92, padding: 6,
                  opacity: inMonth ? 1 : 0.4,
                  outline: isToday ? '2px solid #005F2C' : 'none',
                  outlineOffset: -2,
                }}
              >
                <div style={{ fontSize: 11, color: isToday ? '#005F2C' : '#999', fontWeight: isToday ? 700 : 400, marginBottom: 4 }}>{d.getDate()}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {dayReminders.map(r => {
                    const overdue = !r.done && r.due_date < todayStr
                    return (
                      <div
                        key={r.id}
                        title={r.notes || r.title}
                        style={{
                          fontSize: 10.5, padding: '2px 5px', borderRadius: 4, cursor: 'pointer',
                          background: r.done ? '#edfaf1' : overdue ? '#fdeeee' : '#eef2ff',
                          color: r.done ? '#888' : overdue ? '#dc2626' : '#333',
                          textDecoration: r.done ? 'line-through' : 'none',
                          display: 'flex', justifyContent: 'space-between', gap: 4,
                        }}
                      >
                        <span onClick={() => toggleDone(r)} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.title}{r.parcel_claims && ` (${r.parcel_claims.customer_name})`}
                        </span>
                        <span onClick={() => deleteReminder(r)} style={{ color: '#aaa', fontWeight: 700 }}>×</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#999', marginTop: 10 }}>
        Click a reminder to mark it done (green, struck through) · × removes it · reminders can be freeform or linked to a specific claim
      </div>
    </div>
  )
}
