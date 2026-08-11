import React, { useState, useEffect, useCallback, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import {
  CLAIM_CAP, COURIERS, STAGES, ISSUE_TYPES, CLAIM_STATUSES,
  stageLabel, stageColour, issueColour, claimStatusLabel, claimStatusColour,
  fmtGbp, fmtDate, today,
} from '../lib/parcelClaims'

function emptyForm() {
  return {
    date_started: today(), customer_name: '', email: '', ebay_username: '',
    courier: 'DPD', consignment_ref: '', retail: '', cost: '', claim_amount: '',
    claim_ref: '', stage: 'investigating', issue_type: '', notes: '', handled_by: '',
  }
}

function toCSV(rows) {
  if (!rows.length) return ''
  const headers = [
    'Date', 'Name', 'Email', 'eBay Username', 'Courier', 'Consignment Ref',
    'Retail', 'Cost', 'Claim Amount', 'Claim Ref', 'Stage', 'Issue', 'Claim Status', 'Notes',
  ]
  const lines = rows.map(r => [
    r.date_started, r.customer_name, r.email, r.ebay_username, r.courier, r.consignment_ref,
    r.retail, r.cost, r.claim_amount, r.claim_ref, stageLabel(r.stage),
    r.issue_type ? (ISSUE_TYPES.find(i => i.value === r.issue_type)?.label || r.issue_type) : '',
    claimStatusLabel(r.claim_status), r.notes,
  ])
  return [headers, ...lines]
    .map(row => row.map(v => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
}

function downloadCSV(rows, filename) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function monthLabel(ym) {
  const [y, m] = (ym || '').split('-')
  if (!y || !m) return ym
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' })
}

export default function ParcelClaimsPage() {
  // --- Password gate (no persistence — same pattern as /adjustments) ---
  const [unlocked, setUnlocked] = useState(false)
  const [gatePassword, setGatePassword] = useState('')
  const [gateChecking, setGateChecking] = useState(false)
  const [gateError, setGateError] = useState(null)

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const [statusFilter, setStatusFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [courierFilter, setCourierFilter] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [search, setSearch] = useState('')
  const searchDebounce = useRef(null)
  const [searchLive, setSearchLive] = useState('')

  const [expanded, setExpanded] = useState(new Set())
  const [historyByRow, setHistoryByRow] = useState({})
  const [historyLoading, setHistoryLoading] = useState({})

  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addError, setAddError] = useState(null)

  const [editing, setEditing] = useState(null) // { id, field }
  const [editValue, setEditValue] = useState('')

  async function handleUnlock(e) {
    e.preventDefault()
    if (!gatePassword) return
    setGateChecking(true)
    setGateError(null)
    try {
      const res = await fetch('/api/parcel-claims-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: gatePassword }),
      })
      if (!res.ok) throw new Error('Incorrect password')
      setUnlocked(true)
    } catch (err) {
      setGateError(err.message)
    } finally {
      setGateChecking(false)
    }
  }

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (stageFilter) params.set('stage', stageFilter)
      if (courierFilter) params.set('courier', courierFilter)
      if (showClosed) params.set('closed', '1')
      if (searchLive.trim()) params.set('search', searchLive.trim())
      const res = await fetch(`/api/parcel-claims?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setRows(data.rows || [])
      setTotal(data.total ?? (data.rows || []).length)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, stageFilter, courierFilter, showClosed, searchLive])

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await fetch('/api/parcel-claims/stats')
      const data = await res.json()
      if (res.ok) setStats(data)
    } catch {
      // stats are a nice-to-have — a failed fetch shouldn't block the page
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => { if (unlocked) { loadRows(); loadStats() } }, [unlocked, loadRows, loadStats])

  function handleSearchChange(v) {
    setSearch(v)
    clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => setSearchLive(v), 350)
  }

  async function toggleExpand(row) {
    setExpanded(s => {
      const n = new Set(s)
      n.has(row.id) ? n.delete(row.id) : n.add(row.id)
      return n
    })
    if (historyByRow[row.id]) return
    setHistoryLoading(h => ({ ...h, [row.id]: true }))
    try {
      const params = new URLSearchParams({ excludeId: row.id })
      if (row.email) params.set('email', row.email)
      if (row.ebay_username) params.set('ebay', row.ebay_username)
      if (!row.email && !row.ebay_username) params.set('name', row.customer_name)
      const res = await fetch(`/api/parcel-claims/customer?${params}`)
      const data = await res.json()
      setHistoryByRow(h => ({ ...h, [row.id]: res.ok ? (data.rows || []) : [] }))
    } catch {
      setHistoryByRow(h => ({ ...h, [row.id]: [] }))
    } finally {
      setHistoryLoading(h => ({ ...h, [row.id]: false }))
    }
  }

  async function patchRow(id, patch) {
    const res = await fetch(`/api/parcel-claims/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Update failed')
    setRows(rs => rs.map(r => r.id === id ? data.row : r))
    loadStats()
    return data.row
  }

  function startEdit(row, field, currentValue) {
    setEditing({ id: row.id, field })
    setEditValue(currentValue ?? '')
  }

  async function commitEdit() {
    if (!editing) return
    const { id, field } = editing
    setEditing(null)
    try {
      await patchRow(id, { [field]: editValue })
    } catch (err) {
      setError(err.message)
    }
  }

  async function quickSelect(row, field, value) {
    try {
      await patchRow(row.id, { [field]: value })
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteRow(row) {
    if (!confirm(`Delete the claim for ${row.customer_name}? This can't be undone.`)) return
    try {
      const res = await fetch(`/api/parcel-claims/${row.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setRows(rs => rs.filter(r => r.id !== row.id))
      loadStats()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddSubmit(e) {
    e.preventDefault()
    if (!form.customer_name.trim()) return
    setAddSubmitting(true)
    setAddError(null)
    try {
      const res = await fetch('/api/parcel-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setRows(rs => [data.row, ...rs])
      setForm(emptyForm())
      setShowAddForm(false)
      loadStats()
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAddSubmitting(false)
    }
  }

  function overCap(row) {
    const claimed = row.claim_amount != null ? row.claim_amount : row.cost
    const isClosed = row.stage === 'delivered_ok' || ['settled', 'denied'].includes(row.claim_status)
    return !isClosed && claimed != null && claimed > CLAIM_CAP
  }

  function editableText(row, field, display) {
    const isEditing = editing?.id === row.id && editing?.field === field
    if (isEditing) {
      return (
        <input
          className="editable-input"
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
        />
      )
    }
    return (
      <span className="editable-cell" onClick={() => startEdit(row, field, row[field])}>
        {display}
      </span>
    )
  }

  function editableNumber(row, field) {
    const isEditing = editing?.id === row.id && editing?.field === field
    if (isEditing) {
      return (
        <input
          className="editable-input"
          type="number"
          step="0.01"
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
          style={{ textAlign: 'right' }}
        />
      )
    }
    return (
      <span className="editable-cell" onClick={() => startEdit(row, field, row[field])}>
        {row[field] != null ? fmtGbp(row[field]) : '—'}
      </span>
    )
  }

  if (!unlocked) {
    return (
      <div className="container" style={{ maxWidth: 380 }}>
        <div className="page-title">Missing Parcels</div>
        <div className="page-sub">This section is restricted. Enter the password to continue.</div>
        <form onSubmit={handleUnlock} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="form-input"
            type="password"
            placeholder="Password"
            value={gatePassword}
            onChange={e => setGatePassword(e.target.value)}
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={gateChecking || !gatePassword}>
            {gateChecking ? 'Checking…' : 'Continue'}
          </button>
          {gateError && <div className="state-box error">{gateError}</div>}
        </form>
      </div>
    )
  }

  return (
    <div className="container-xl">
      <div className="page-title">Missing Parcels</div>
      <div className="page-sub">
        Lost/missing courier claims — track status, cost exposure, and what's actually been recovered from DPD.
      </div>

      {/* --- Stats --- */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-label">Open Cost Exposure</div>
          <div className="stat-value">{stats ? fmtGbp(stats.openCostExposure) : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Claimed (Sent/Received)</div>
          <div className="stat-value">{stats ? fmtGbp(stats.totalClaimed) : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Recovered (Settled)</div>
          <div className="stat-value" style={{ color: '#16a34a' }}>{stats ? fmtGbp(stats.totalRecovered) : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Denied / Written Off</div>
          <div className="stat-value" style={{ color: stats?.totalDenied > 0 ? '#dc2626' : undefined }}>
            {stats ? fmtGbp(stats.totalDenied) : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Over £{CLAIM_CAP} Cap</div>
          <div className="stat-value" style={{ color: stats?.overCapCount > 0 ? '#dc2626' : undefined }}>
            {stats ? stats.overCapCount : '—'}
          </div>
        </div>
      </div>

      {/* --- Running total chart --- */}
      {stats?.series?.length > 1 && (
        <div className="chart-card">
          <div className="chart-card-title">Running Total — Cost vs. Recovered (cumulative, by month)</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.series} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `£${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v, name) => [fmtGbp(v), name]} labelFormatter={monthLabel} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="cumulativeCost" name="Cumulative Cost" stroke="#dc2626" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cumulativeRecovered" name="Cumulative Recovered" stroke="#16a34a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* --- Colour key (same meanings as the old sheet's two colour columns) --- */}
      <div className="returns-legend">
        {STAGES.map(s => (
          <span key={s.value} className={`status-badge ${s.colour}`}>{s.label}</span>
        ))}
        <span style={{ margin: '0 4px', color: '#ccc' }}>|</span>
        {ISSUE_TYPES.map(i => (
          <span key={i.value} className={`status-badge ${i.colour}`}>{i.label}</span>
        ))}
      </div>

      {/* --- Filters --- */}
      <div className="filter-builder">
        <div className="filter-builder-header">
          <button className="add-filter-btn" onClick={() => setShowAddForm(s => !s)}>
            {showAddForm ? '× Close' : '+ Add Claim'}
          </button>
          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowClosed(s => !s)}>
            {showClosed ? 'Showing all (incl. closed)' : 'Show closed too'}
          </button>
          <input
            className="search-input"
            type="text"
            placeholder="Search name, email, eBay, consignment or claim ref…"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            style={{ width: 280, marginLeft: 'auto' }}
          />
        </div>

        <div className="chip-bar">
          <button className={`chip-btn${!statusFilter ? ' active' : ''}`} onClick={() => setStatusFilter('')}>All statuses</button>
          {CLAIM_STATUSES.map(s => (
            <button key={s.value} className={`chip-btn${statusFilter === s.value ? ' active' : ''}`} onClick={() => setStatusFilter(s.value)}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <select className="filter-select" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
            <option value="">All stages</option>
            {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="filter-select" value={courierFilter} onChange={e => setCourierFilter(e.target.value)}>
            <option value="">All couriers</option>
            {COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* --- Add form --- */}
      {showAddForm && (
        <form className="filter-builder" onSubmit={handleAddSubmit} style={{ gap: 12 }}>
          <div className="chart-card-title">New Claim</div>
          <div className="filter-row">
            <input className="form-input" style={{ maxWidth: 150 }} type="date" value={form.date_started} onChange={e => setForm(f => ({ ...f, date_started: e.target.value }))} />
            <input className="form-input" placeholder="Customer name *" required value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
            <input className="form-input" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <input className="form-input" placeholder="eBay username" value={form.ebay_username} onChange={e => setForm(f => ({ ...f, ebay_username: e.target.value }))} />
          </div>
          <div className="filter-row">
            <select className="form-select" style={{ maxWidth: 130 }} value={form.courier} onChange={e => setForm(f => ({ ...f, courier: e.target.value }))}>
              {COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="form-input" placeholder="Consignment ref" value={form.consignment_ref} onChange={e => setForm(f => ({ ...f, consignment_ref: e.target.value }))} />
            <input className="form-input" placeholder="Claim ref" value={form.claim_ref} onChange={e => setForm(f => ({ ...f, claim_ref: e.target.value }))} />
          </div>
          <div className="filter-row">
            <input className="form-input" style={{ maxWidth: 130 }} type="number" step="0.01" placeholder="Retail £" value={form.retail} onChange={e => setForm(f => ({ ...f, retail: e.target.value }))} />
            <input className="form-input" style={{ maxWidth: 130 }} type="number" step="0.01" placeholder="Cost £" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
            <div>
              <input className="form-input" style={{ maxWidth: 130 }} type="number" step="0.01" placeholder={`Claim amount £`} value={form.claim_amount} onChange={e => setForm(f => ({ ...f, claim_amount: e.target.value }))} />
              {form.claim_amount && Number(form.claim_amount) > CLAIM_CAP && <span className="cap-warning">OVER £{CLAIM_CAP}</span>}
            </div>
          </div>
          <div className="filter-row">
            <select className="form-select" value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
              {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className="form-select" value={form.issue_type} onChange={e => setForm(f => ({ ...f, issue_type: e.target.value }))}>
              <option value="">No issue type yet</option>
              {ISSUE_TYPES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
            <input className="form-input" placeholder="Handled by (initials)" style={{ maxWidth: 160 }} value={form.handled_by} onChange={e => setForm(f => ({ ...f, handled_by: e.target.value }))} />
          </div>
          <textarea className="form-input" placeholder="Notes" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="filter-row">
            <button className="btn btn-primary" type="submit" disabled={addSubmitting || !form.customer_name.trim()}>
              {addSubmitting ? 'Saving…' : 'Save Claim'}
            </button>
            {addError && <span style={{ color: '#dc2626', fontSize: 13 }}>{addError}</span>}
          </div>
        </form>
      )}

      {error && <div className="state-box error">Error: {error}</div>}

      <div className="results-bar">
        <span className="results-count">{loading ? 'Loading…' : `${rows.length} of ${total} claims`}</span>
        {rows.length > 0 && (
          <button className="btn btn-secondary" onClick={() => downloadCSV(rows, `missing-parcels-${today()}.csv`)}>
            Download CSV
          </button>
        )}
      </div>

      {loading ? (
        <div className="state-box"><div className="spinner" />Loading claims…</div>
      ) : rows.length === 0 ? (
        <div className="state-box">No claims match the current filters.</div>
      ) : (
        <div className="table-wrap">
          <table className="table-compact">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Date</th>
                <th>Customer</th>
                <th>Courier</th>
                <th style={{ textAlign: 'right' }}>Retail</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th style={{ textAlign: 'right' }}>Claim Amount</th>
                <th>Claim Ref</th>
                <th>Stage</th>
                <th>Issue</th>
                <th>Claim Status</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isOpen = expanded.has(row.id)
                const history = historyByRow[row.id]
                return (
                  <React.Fragment key={row.id}>
                    <tr>
                      <td style={{ color: '#888', fontSize: 11, textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleExpand(row)}>
                        {isOpen ? '▾' : '▸'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{editableText(row, 'date_started', fmtDate(row.date_started))}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{editableText(row, 'customer_name', row.customer_name)}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                          {row.email || '—'}{row.ebay_username ? ` · eBay: ${row.ebay_username}` : ''}
                        </div>
                      </td>
                      <td>
                        <div>{row.courier}</div>
                        <div style={{ fontSize: 10, color: '#aaa' }} className="sku-cell">{row.consignment_ref || '—'}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{editableNumber(row, 'retail')}</td>
                      <td style={{ textAlign: 'right' }}>{editableNumber(row, 'cost')}</td>
                      <td style={{ textAlign: 'right' }}>
                        {editableNumber(row, 'claim_amount')}
                        {overCap(row) && <span className="cap-warning">OVER £{CLAIM_CAP}</span>}
                      </td>
                      <td>{editableText(row, 'claim_ref', row.claim_ref || '—')}</td>
                      <td>
                        <select
                          className={`status-badge ${stageColour(row.stage)} editable-select`}
                          value={row.stage}
                          onChange={e => quickSelect(row, 'stage', e.target.value)}
                        >
                          {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className={`status-badge ${row.issue_type ? issueColour(row.issue_type) : ''} editable-select`}
                          value={row.issue_type || ''}
                          onChange={e => quickSelect(row, 'issue_type', e.target.value)}
                        >
                          <option value="">—</option>
                          {ISSUE_TYPES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className={`status-badge ${claimStatusColour(row.claim_status)} editable-select`}
                          value={row.claim_status}
                          onChange={e => quickSelect(row, 'claim_status', e.target.value)}
                        >
                          {CLAIM_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td>{editableText(row, 'notes', row.notes || '—')}</td>
                      <td>
                        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => deleteRow(row)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={13} className="expanded-detail">
                          <div className="return-block">
                            <div className="return-block-header" style={{ marginBottom: 8 }}>
                              <strong>Previous claims for {row.customer_name}</strong>
                            </div>
                            {historyLoading[row.id] ? (
                              <div style={{ fontSize: 12, color: '#888' }}>Loading…</div>
                            ) : !history || history.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#888' }}>No other claims found for this customer.</div>
                            ) : (
                              <table className="inner-table">
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Courier</th>
                                    <th style={{ textAlign: 'right' }}>Cost</th>
                                    <th style={{ textAlign: 'right' }}>Claim Amount</th>
                                    <th>Stage</th>
                                    <th>Claim Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {history.map(h => (
                                    <tr key={h.id}>
                                      <td>{fmtDate(h.date_started)}</td>
                                      <td>{h.courier}</td>
                                      <td style={{ textAlign: 'right' }}>{h.cost != null ? fmtGbp(h.cost) : '—'}</td>
                                      <td style={{ textAlign: 'right' }}>{h.claim_amount != null ? fmtGbp(h.claim_amount) : '—'}</td>
                                      <td><span className={`status-badge ${stageColour(h.stage)}`}>{stageLabel(h.stage)}</span></td>
                                      <td><span className={`status-badge ${claimStatusColour(h.claim_status)}`}>{claimStatusLabel(h.claim_status)}</span></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
