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

// High Value: refunded >= £500 in period | Frequent: lifetime return rate >= 25%
function pattern(c) {
  const highValue = c.totalRefunded >= 500
  const frequent = c.returnRate >= 25
  if (highValue && frequent) return 'both'
  if (highValue) return 'high-value'
  if (frequent) return 'frequent'
  return 'low'
}

const PATTERN_LABEL = {
  both: 'Both',
  'high-value': 'High Value',
  frequent: 'Frequent',
  low: 'Low',
}

function buildCSV(customers) {
  const headers = [
    'Name', 'Email', 'Lifetime Orders', 'Orders With Returns',
    'Lifetime Return Rate %', 'Avg Days to Return', 'Refund Events',
    'Total Refunded (£)', 'Net Spend (£)', 'First Return', 'Last Return', 'Pattern',
  ]
  const rows = customers.map(c => [
    c.name, c.email, c.lifetimeOrders, c.ordersWithReturns,
    c.returnRate, c.avgDaysToReturn, c.totalRefundCount,
    c.totalRefunded.toFixed(2), c.netSpend.toFixed(2),
    c.firstReturn || '', c.lastReturn || '', PATTERN_LABEL[pattern(c)],
  ])
  return [headers, ...rows]
    .map(r => r.map(v => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
}

function downloadCSV(customers, filename) {
  const blob = new Blob([buildCSV(customers)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const SORTERS = {
  name:             (a, b, d) => d === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
  lifetimeOrders:   (a, b, d) => d === 'asc' ? a.lifetimeOrders - b.lifetimeOrders : b.lifetimeOrders - a.lifetimeOrders,
  ordersWithReturns:(a, b, d) => d === 'asc' ? a.ordersWithReturns - b.ordersWithReturns : b.ordersWithReturns - a.ordersWithReturns,
  returnRate:       (a, b, d) => d === 'asc' ? a.returnRate - b.returnRate : b.returnRate - a.returnRate,
  avgDaysToReturn:  (a, b, d) => d === 'asc' ? a.avgDaysToReturn - b.avgDaysToReturn : b.avgDaysToReturn - a.avgDaysToReturn,
  totalRefundCount: (a, b, d) => d === 'asc' ? a.totalRefundCount - b.totalRefundCount : b.totalRefundCount - a.totalRefundCount,
  totalRefunded:    (a, b, d) => d === 'asc' ? a.totalRefunded - b.totalRefunded : b.totalRefunded - a.totalRefunded,
  netSpend:         (a, b, d) => d === 'asc' ? a.netSpend - b.netSpend : b.netSpend - a.netSpend,
  lastReturn:       (a, b, d) => d === 'asc'
    ? (a.lastReturn || '').localeCompare(b.lastReturn || '')
    : (b.lastReturn || '').localeCompare(a.lastReturn || ''),
}

export default function ReturnsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [startDate, setStartDate] = useState(daysAgo(89))
  const [endDate, setEndDate] = useState(today())
  const [sortField, setSortField] = useState('totalRefunded')
  const [sortDir, setSortDir] = useState('desc')
  const [search, setSearch] = useState('')
  const [patternFilter, setPatternFilter] = useState('')
  const [expanded, setExpanded] = useState(new Set())

  async function loadData() {
    setLoading(true)
    setError(null)
    setData(null)
    setExpanded(new Set())
    try {
      const res = await fetch(`/api/returns-data?startDate=${startDate}&endDate=${endDate}`)
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

  function toggleExpand(email) {
    setExpanded(s => {
      const n = new Set(s)
      n.has(email) ? n.delete(email) : n.add(email)
      return n
    })
  }

  const displayedCustomers = useMemo(() => {
    if (!data?.customers) return []
    let rows = data.customers
    if (patternFilter) rows = rows.filter(c => pattern(c) === patternFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    }
    const fn = SORTERS[sortField]
    if (fn) rows = [...rows].sort((a, b) => fn(a, b, sortDir))
    return rows
  }, [data, patternFilter, search, sortField, sortDir])

  const stats = useMemo(() => {
    if (!data?.customers?.length) return null
    const total = data.customers.reduce((s, c) => s + c.totalRefunded, 0)
    const refunds = data.customers.reduce((s, c) => s + c.totalRefundCount, 0)
    const critical = data.customers.filter(c => pattern(c) === 'both').length
    const avgDays = Math.round(
      data.customers.reduce((s, c) => s + c.avgDaysToReturn, 0) / data.customers.length
    )
    return { customers: data.customers.length, refunds, total, critical, avgDays }
  }, [data])

  function si(field) {
    return sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  }

  function th(field, label, extraStyle = {}) {
    return (
      <th
        onClick={() => handleSort(field)}
        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...extraStyle }}
      >
        {label}{si(field)}
      </th>
    )
  }

  const dayCount = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1

  return (
    <div className="container">
      <div className="page-title">Returns</div>
      <div className="page-sub">
        Customers ranked by refund activity. Identify serial returners, total value refunded, and exactly what they returned.
      </div>

      <div className="date-presets">
        {[
          { label: '30 days', n: 29 },
          { label: '90 days', n: 89 },
          { label: '180 days', n: 179 },
          { label: '1 year', n: 364 },
        ].map(p => (
          <button
            key={p.label}
            className="preset-btn"
            onClick={() => { setStartDate(daysAgo(p.n)); setEndDate(today()) }}
          >
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
        {startDate && endDate && (
          <div className="date-range-label">{dayCount} days</div>
        )}
        <button className="btn btn-primary" onClick={loadData} disabled={loading}>
          {loading ? 'Loading…' : data ? 'Reload' : 'Load Returns'}
        </button>
        {data && !loading && (
          <span className="load-count">{data.ordersScanned.toLocaleString()} orders scanned</span>
        )}
      </div>

      {loading && (
        <div className="state-box">
          <div className="spinner" />
          <div style={{ fontWeight: 500 }}>Fetching refunded orders from Shopify…</div>
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>Larger date ranges may take a moment</div>
        </div>
      )}

      {error && <div className="state-box error">Error: {error}</div>}

      {data && !loading && (
        <>
          {stats && (
            <div className="stats-bar">
              <div className="stat-card">
                <div className="stat-label">Customers</div>
                <div className="stat-value">{stats.customers.toLocaleString()}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Refund Events</div>
                <div className="stat-value">{stats.refunds.toLocaleString()}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Refunded</div>
                <div className="stat-value">{fmtGbp(stats.total)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Critical (Both)</div>
                <div className="stat-value" style={{ color: stats.critical > 0 ? '#dc2626' : undefined }}>
                  {stats.critical.toLocaleString()}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Avg Days to Return</div>
                <div className="stat-value">{stats.avgDays}</div>
              </div>
            </div>
          )}

          <div className="returns-legend">
            <span className="status-badge pattern-both">Both</span> High value (&ge;£500) + frequent (&ge;25% rate) &nbsp;&nbsp;
            <span className="status-badge pattern-high-value">High Value</span> &ge;£500 refunded &nbsp;&nbsp;
            <span className="status-badge pattern-frequent">Frequent</span> &ge;25% lifetime return rate &nbsp;&nbsp;
            <span className="status-badge pattern-low">Low</span> Neither
          </div>

          <div className="results-bar">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="search-input"
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: 220 }}
              />
              <select
                className="type-select"
                value={patternFilter}
                onChange={e => setPatternFilter(e.target.value)}
                style={{ minWidth: 160 }}
              >
                <option value="">All patterns</option>
                <option value="both">Both (critical)</option>
                <option value="high-value">High Value only</option>
                <option value="frequent">Frequent only</option>
                <option value="low">Low</option>
              </select>
              <span className="results-count">
                {displayedCustomers.length} customer{displayedCustomers.length !== 1 ? 's' : ''}
              </span>
            </div>
            {displayedCustomers.length > 0 && (
              <button
                className="btn btn-secondary"
                onClick={() => downloadCSV(displayedCustomers, `returns-${startDate}-to-${endDate}.csv`)}
              >
                Download CSV
              </button>
            )}
          </div>

          {displayedCustomers.length === 0 ? (
            <div className="state-box">No customers with returns in this period.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    {th('name', 'Customer')}
                    {th('lifetimeOrders', 'Orders', { textAlign: 'right' })}
                    {th('ordersWithReturns', 'W/ Returns', { textAlign: 'right' })}
                    {th('returnRate', 'Lifetime Rate', { textAlign: 'right' })}
                    {th('avgDaysToReturn', 'Avg Return', { textAlign: 'right' })}
                    {th('totalRefundCount', 'Refunds', { textAlign: 'right' })}
                    {th('totalRefunded', 'Total Refunded', { textAlign: 'right' })}
                    {th('netSpend', 'Net Spend', { textAlign: 'right' })}
                    {th('lastReturn', 'Last Return')}
                    <th>Pattern</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCustomers.map(c => {
                    const p = pattern(c)
                    const isOpen = expanded.has(c.email)
                    const rateColor = c.returnRate >= 25 ? '#dc2626' : c.returnRate >= 15 ? '#d97706' : '#16a34a'
                    const daysColor = c.avgDaysToReturn <= 7 ? '#dc2626' : c.avgDaysToReturn <= 21 ? '#d97706' : '#555'
                    const netColor = c.netSpend < 0 ? '#dc2626' : '#16a34a'
                    return (
                      <React.Fragment key={c.email}>
                        <tr onClick={() => toggleExpand(c.email)} style={{ cursor: 'pointer' }}>
                          <td style={{ color: '#888', fontSize: 11, textAlign: 'center' }}>
                            {isOpen ? '▾' : '▸'}
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{c.email}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>{c.lifetimeOrders}</td>
                          <td style={{ textAlign: 'right' }}>{c.ordersWithReturns}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ color: rateColor, fontWeight: 600 }}>{c.returnRate}%</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ color: daysColor, fontWeight: 600 }}>
                              {c.avgDaysToReturn}d
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>{c.totalRefundCount}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtGbp(c.totalRefunded)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: netColor }}>
                            {fmtGbp(c.netSpend)}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.lastReturn)}</td>
                          <td>
                            <span className={`status-badge pattern-${p}`}>
                              {PATTERN_LABEL[p]}
                            </span>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={11} className="expanded-detail">
                              {[...c.returns]
                                .sort((a, b) => b.refundDate.localeCompare(a.refundDate))
                                .map((ret, i) => (
                                  <div key={i} className="return-block">
                                    <div className="return-block-header">
                                      <strong>{ret.order}</strong>
                                      <span>Ordered: {fmtDate(ret.orderDate)}</span>
                                      <span>Refunded: {fmtDate(ret.refundDate)}</span>
                                      <span style={{ fontWeight: 600 }}>{fmtGbp(ret.refundAmount)}</span>
                                      {ret.note && (
                                        <span style={{ color: '#888', fontStyle: 'italic' }}>"{ret.note}"</span>
                                      )}
                                    </div>
                                    {ret.items.length > 0 && (
                                      <table className="inner-table">
                                        <thead>
                                          <tr>
                                            <th>Product</th>
                                            <th>Variant</th>
                                            <th>SKU</th>
                                            <th style={{ textAlign: 'right' }}>Qty</th>
                                            <th style={{ textAlign: 'right' }}>Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {ret.items.map((item, j) => (
                                            <tr key={j}>
                                              <td>{item.product}</td>
                                              <td style={{ color: '#888' }}>{item.variant || '—'}</td>
                                              <td className="sku-cell">{item.sku}</td>
                                              <td style={{ textAlign: 'right' }}>{item.qty}</td>
                                              <td style={{ textAlign: 'right' }}>{fmtGbp(item.amount)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                ))}
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
        </>
      )}
    </div>
  )
}
