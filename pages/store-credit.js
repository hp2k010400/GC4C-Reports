import React, { useState, useMemo } from 'react'

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtGbp(n) {
  return `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function buildCSV(cards) {
  const headers = ['Customer', 'Email', 'Issued (£)', 'Used (£)', 'Remaining (£)', 'Date Issued', 'Note']
  const rows = cards.map(c => [
    c.customer.name,
    c.customer.email,
    c.initialValue.toFixed(2),
    (c.initialValue - c.balance).toFixed(2),
    c.balance.toFixed(2),
    c.createdAt,
    c.note,
  ])
  return [headers, ...rows]
    .map(r => r.map(v => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
}

function downloadCSV(cards, filename) {
  const blob = new Blob([buildCSV(cards)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const SORTERS = {
  name:         (a, b, d) => d === 'asc' ? a.customer.name.localeCompare(b.customer.name) : b.customer.name.localeCompare(a.customer.name),
  initialValue: (a, b, d) => d === 'asc' ? a.initialValue - b.initialValue : b.initialValue - a.initialValue,
  used:         (a, b, d) => { const au = a.initialValue - a.balance, bu = b.initialValue - b.balance; return d === 'asc' ? au - bu : bu - au },
  balance:      (a, b, d) => d === 'asc' ? a.balance - b.balance : b.balance - a.balance,
  createdAt:    (a, b, d) => d === 'asc' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
}

export default function StoreCreditPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [startDate, setStartDate] = useState(daysAgo(89))
  const [endDate, setEndDate] = useState(today())
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')

  async function loadData() {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      const res = await fetch(`/api/store-credit-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function si(field) {
    return sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  }

  function th(field, label, sub, extraStyle = {}) {
    return (
      <th onClick={() => handleSort(field)} style={{ cursor: 'pointer', userSelect: 'none', ...extraStyle }}>
        <span style={{ whiteSpace: 'nowrap' }}>{label}{si(field)}</span>
        {sub && <div className="col-sub">{sub}</div>}
      </th>
    )
  }

  const displayedCards = useMemo(() => {
    if (!data?.cards) return []
    let rows = data.cards
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(c =>
        c.customer.name.toLowerCase().includes(q) ||
        c.customer.email.toLowerCase().includes(q)
      )
    }
    const fn = SORTERS[sortField]
    if (fn) rows = [...rows].sort((a, b) => fn(a, b, sortDir))
    return rows
  }, [data, search, sortField, sortDir])

  const dayCount = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1

  return (
    <div className="container-xl">
      <div className="page-title">Store Credit</div>
      <div className="page-sub">
        Gift cards issued to customers in the selected period. Pro/trade accounts excluded.
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
          {loading ? 'Loading…' : data ? 'Reload' : 'Load Store Credit'}
        </button>
        {data && !loading && (
          <span className="load-count">{data.cards.length.toLocaleString()} gift cards found</span>
        )}
      </div>

      {loading && (
        <div className="state-box">
          <div className="spinner" />
          <div style={{ fontWeight: 500 }}>Fetching gift cards from Shopify…</div>
        </div>
      )}

      {error && <div className="state-box error">Error: {error}</div>}

      {data && !loading && (
        <>
          <div className="stats-bar">
            <div className="stat-card">
              <div className="stat-label">Customers</div>
              <div className="stat-value">{data.summary.count.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Issued</div>
              <div className="stat-value">{fmtGbp(data.summary.totalIssued)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Used</div>
              <div className="stat-value" style={{ color: '#005F2C' }}>{fmtGbp(data.summary.totalUsed)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Remaining Balance</div>
              <div className="stat-value" style={{ color: '#d97706' }}>{fmtGbp(data.summary.totalRemaining)}</div>
            </div>
          </div>

          <div className="results-bar">
            <input
              className="search-input"
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 240 }}
            />
            <span className="results-count" style={{ marginLeft: 12 }}>
              {displayedCards.length} of {data.cards.length} records
            </span>
            {displayedCards.length > 0 && (
              <button
                className="btn btn-secondary"
                style={{ marginLeft: 'auto' }}
                onClick={() => downloadCSV(displayedCards, `store-credit-${startDate}-to-${endDate}.csv`)}
              >
                Download CSV
              </button>
            )}
          </div>

          {displayedCards.length === 0 ? (
            <div className="state-box">No records found.</div>
          ) : (
            <div className="table-wrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    {th('name',         'Customer',   'Name & email')}
                    {th('initialValue', 'Issued',     'Gift card value',  { textAlign: 'right' })}
                    {th('used',         'Used',       'Spent so far',     { textAlign: 'right' })}
                    {th('balance',      'Remaining',  'Current balance',  { textAlign: 'right' })}
                    {th('createdAt',    'Date',       'Issued on')}
                    <th>Note<div className="col-sub">Staff note</div></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCards.map(c => {
                    const used = parseFloat((c.initialValue - c.balance).toFixed(2))
                    const pctUsed = c.initialValue > 0 ? Math.round((used / c.initialValue) * 100) : 0
                    return (
                      <tr key={c.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{c.customer.name}</div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{c.customer.email}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtGbp(c.initialValue)}</td>
                        <td style={{ textAlign: 'right', color: used > 0 ? '#005F2C' : '#aaa' }}>
                          {fmtGbp(used)}
                          {used > 0 && <span style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>{pctUsed}%</span>}
                        </td>
                        <td style={{ textAlign: 'right', color: c.balance > 0 ? '#d97706' : '#aaa' }}>
                          {fmtGbp(c.balance)}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.createdAt)}</td>
                        <td style={{ color: '#888', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.note || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
