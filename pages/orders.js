import { useState, useEffect, useMemo } from 'react'
import { ORDER_FIELDS, CONDITIONS, applyFilters, needsValue } from '../lib/filterEngine.js'

let _cache = null

const DEFAULT_COLS = ['Order', 'Date', 'Customer', 'SKU', 'Product', 'Qty', 'Unit Price', 'Line Total', 'Financial Status', 'Fulfillment Status']
const ALL_COLS = [
  'Order', 'Date', 'Financial Status', 'Fulfillment Status',
  'Customer', 'Email', 'SKU', 'Product', 'Variant',
  'Qty', 'Unit Price', 'Line Total', 'Order Total',
  'Discount', 'Discount Code', 'Tags', 'Channel',
]

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

function getFieldDef(key) {
  return ORDER_FIELDS.find(f => f.key === key)
}

function toCSV(rows, cols) {
  return [
    cols.join(','),
    ...rows.map(row =>
      cols.map(col => {
        const val = String(row[col] ?? '')
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"` : val
      }).join(',')
    ),
  ].join('\n')
}

function downloadCSV(rows, cols, filename) {
  const blob = new Blob([toCSV(rows, cols)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function OrdersPage() {
  const [allRows, setAllRows] = useState(_cache?.rows ?? null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const [startDate, setStartDate] = useState(_cache?.startDate ?? daysAgo(30))
  const [endDate, setEndDate] = useState(_cache?.endDate ?? today())
  const [preFinancial, setPreFinancial] = useState(_cache?.preFinancial ?? '')
  const [preFulfillment, setPreFulfillment] = useState(_cache?.preFulfillment ?? '')

  const [filters, setFilters] = useState(_cache?.filters ?? [])
  const [filterLogic, setFilterLogic] = useState(_cache?.filterLogic ?? 'AND')

  const [sortField, setSortField] = useState(_cache?.sortField ?? null)
  const [sortDir, setSortDir] = useState(_cache?.sortDir ?? 'asc')

  const [visibleCols, setVisibleCols] = useState(_cache?.visibleCols ?? DEFAULT_COLS)
  const [showColPicker, setShowColPicker] = useState(false)

  const [savedViews, setSavedViews] = useState([])
  const [viewName, setViewName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  useEffect(() => {
    try {
      setSavedViews(JSON.parse(localStorage.getItem('gc4c_order_views') || '[]'))
    } catch {}
  }, [])

  useEffect(() => {
    if (allRows) {
      _cache = { rows: allRows, startDate, endDate, preFinancial, preFulfillment, filters, filterLogic, sortField, sortDir, visibleCols }
    }
  }, [allRows, startDate, endDate, preFinancial, preFulfillment, filters, filterLogic, sortField, sortDir, visibleCols])

  async function loadOrders() {
    setLoading(true)
    setError(null)
    setAllRows(null)
    setFilters([])
    setSortField(null)
    setProgress({ count: 0 })

    let rows = []
    try {
      let pageInfo = null
      do {
        const params = new URLSearchParams()
        if (pageInfo) {
          params.set('page_info', pageInfo)
        } else {
          params.set('startDate', startDate)
          params.set('endDate', endDate)
          if (preFinancial)   params.set('financial_status', preFinancial)
          if (preFulfillment) params.set('fulfillment_status', preFulfillment)
        }

        const res = await fetch(`/api/orders-data?${params}`)
        let json
        try { json = await res.json() } catch {
          throw new Error('This took too long — try a shorter date range or use the payment/fulfillment filters to narrow results first')
        }
        if (!res.ok) throw new Error(json.error)

        rows = rows.concat(json.rows)
        pageInfo = json.nextPageInfo
        setProgress({ count: rows.length })
      } while (pageInfo)

      setAllRows(rows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const filteredRows = useMemo(() => {
    if (!allRows) return []
    let rows = applyFilters(allRows, filters, filterLogic)
    if (sortField) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortField] ?? ''
        const bv = b[sortField] ?? ''
        const na = parseFloat(String(av).replace(/[£,]/g, ''))
        const nb = parseFloat(String(bv).replace(/[£,]/g, ''))
        if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av))
      })
    }
    return rows
  }, [allRows, filters, filterLogic, sortField, sortDir])

  function addFilter() {
    setFilters(f => [...f, { id: Date.now(), field: '', condition: '', value: '' }])
  }

  function updateFilter(id, key, val) {
    setFilters(f => f.map(filter => {
      if (filter.id !== id) return filter
      const updated = { ...filter, [key]: val }
      if (key === 'field')     { updated.condition = ''; updated.value = '' }
      if (key === 'condition') { updated.value = '' }
      return updated
    }))
  }

  function removeFilter(id) {
    setFilters(f => f.filter(filter => filter.id !== id))
  }

  function handleSort(col) {
    if (sortField === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(col); setSortDir('asc') }
  }

  function toggleCol(col) {
    setVisibleCols(cols =>
      cols.includes(col) ? cols.filter(c => c !== col) : [...cols, col]
    )
  }

  function saveView() {
    if (!viewName.trim()) return
    const views = [
      { id: Date.now(), name: viewName.trim(), filters, filterLogic, visibleCols },
      ...savedViews,
    ].slice(0, 20)
    localStorage.setItem('gc4c_order_views', JSON.stringify(views))
    setSavedViews(views)
    setViewName('')
    setShowSaveInput(false)
  }

  function loadView(view) {
    setFilters(view.filters || [])
    setFilterLogic(view.filterLogic || 'AND')
    setVisibleCols(view.visibleCols || DEFAULT_COLS)
  }

  function deleteView(id) {
    const views = savedViews.filter(v => v.id !== id)
    localStorage.setItem('gc4c_order_views', JSON.stringify(views))
    setSavedViews(views)
  }

  const activeFilters = filters.filter(f => f.field && f.condition)
  const dayCount = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1
  const csvFilename = `orders-${startDate}-to-${endDate}.csv`

  return (
    <div className="container">
      <div className="page-title">Orders</div>
      <div className="page-sub">
        Load orders for a date range then filter by any field — status, SKU, customer, discount code and more.
      </div>

      {/* Date presets */}
      <div className="date-presets">
        {[
          { label: '7 days',    start: daysAgo(6) },
          { label: '30 days',   start: daysAgo(29) },
          { label: '90 days',   start: daysAgo(89) },
          { label: 'This month', start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10) },
          { label: 'Last month', start: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10), end: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0, 10) },
        ].map(p => (
          <button key={p.label} className="preset-btn" onClick={() => { setStartDate(p.start); setEndDate(p.end ?? today()) }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Pre-filters + load */}
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
        <select value={preFinancial} onChange={e => setPreFinancial(e.target.value)} className="type-select">
          <option value="">Any payment status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
          <option value="partially_refunded">Partially refunded</option>
          <option value="authorized">Authorized</option>
          <option value="voided">Voided</option>
        </select>
        <select value={preFulfillment} onChange={e => setPreFulfillment(e.target.value)} className="type-select">
          <option value="">Any fulfillment status</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="unfulfilled">Unfulfilled</option>
          <option value="partial">Partial</option>
        </select>
        <button className="btn btn-primary" onClick={loadOrders} disabled={loading}>
          {loading ? 'Loading…' : allRows ? 'Reload' : 'Load Orders'}
        </button>
        {allRows && !loading && (
          <span className="load-count">{allRows.length.toLocaleString()} line items loaded</span>
        )}
      </div>

      {loading && (
        <div className="state-box">
          <div className="spinner" />
          <div style={{ fontWeight: 500 }}>
            {progress?.count > 0
              ? `Fetched ${progress.count.toLocaleString()} line items — still going…`
              : 'Connecting to Shopify…'}
          </div>
          {progress?.count > 0 && (
            <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>
              Large date ranges may take a moment
            </div>
          )}
        </div>
      )}

      {error && <div className="state-box error">Error: {error}</div>}

      {allRows && !loading && (
        <>
          {savedViews.length > 0 && (
            <div className="saved-views-bar">
              <span className="saved-views-label">Saved views:</span>
              {savedViews.map(view => (
                <div key={view.id} className="saved-view-chip">
                  <button className="saved-view-name" onClick={() => loadView(view)}>{view.name}</button>
                  <button className="saved-view-delete" onClick={() => deleteView(view.id)}>×</button>
                </div>
              ))}
            </div>
          )}

          <div className="filter-builder">
            <div className="filter-builder-header">
              <button className="add-filter-btn" onClick={addFilter}>+ Add filter</button>
              {filters.length > 1 && (
                <div className="filter-logic-toggle">
                  <button className={`logic-btn${filterLogic === 'AND' ? ' active' : ''}`} onClick={() => setFilterLogic('AND')}>ALL</button>
                  <button className={`logic-btn${filterLogic === 'OR' ? ' active' : ''}`} onClick={() => setFilterLogic('OR')}>ANY</button>
                </div>
              )}
              {filters.length > 0 && (
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setFilters([])}>
                  Clear filters
                </button>
              )}
            </div>

            {filters.map(f => {
              const fieldDef = getFieldDef(f.field)
              const conditions = f.field ? (CONDITIONS[fieldDef?.type] || []) : []
              return (
                <div key={f.id} className="filter-row">
                  <select className="filter-select" value={f.field} onChange={e => updateFilter(f.id, 'field', e.target.value)}>
                    <option value="">Select field…</option>
                    {ORDER_FIELDS.map(fd => <option key={fd.key} value={fd.key}>{fd.label}</option>)}
                  </select>

                  {f.field && (
                    <select className="filter-select" value={f.condition} onChange={e => updateFilter(f.id, 'condition', e.target.value)}>
                      <option value="">Condition…</option>
                      {conditions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}

                  {f.field && f.condition && needsValue(f.condition) && (
                    fieldDef?.type === 'select' ? (
                      <select className="filter-select" value={f.value} onChange={e => updateFilter(f.id, 'value', e.target.value)}>
                        <option value="">Select…</option>
                        {(fieldDef.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        className="filter-value"
                        type={fieldDef?.type === 'number' ? 'number' : fieldDef?.type === 'date' ? 'date' : 'text'}
                        value={f.value}
                        onChange={e => updateFilter(f.id, 'value', e.target.value)}
                        placeholder="Value…"
                      />
                    )
                  )}

                  <button className="filter-remove" onClick={() => removeFilter(f.id)}>×</button>
                </div>
              )
            })}
          </div>

          <div className="results-bar">
            <span className="results-count">
              {filteredRows.length.toLocaleString()} of {allRows.length.toLocaleString()} line items
              {activeFilters.length > 0 && (
                <span style={{ color: '#888', marginLeft: 6 }}>
                  ({activeFilters.length} filter{activeFilters.length > 1 ? 's' : ''} active)
                </span>
              )}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {activeFilters.length > 0 && (
                showSaveInput ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="filter-value"
                      placeholder="View name…"
                      value={viewName}
                      onChange={e => setViewName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveView()}
                      autoFocus
                    />
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={saveView}>Save</button>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowSaveInput(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowSaveInput(true)}>
                    Save view
                  </button>
                )
              )}
              <div style={{ position: 'relative' }}>
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowColPicker(c => !c)}>
                  Columns ({visibleCols.length})
                </button>
                {showColPicker && (
                  <div className="col-picker-dropdown">
                    {ALL_COLS.map(col => (
                      <label key={col} className="col-picker-item">
                        <input type="checkbox" checked={visibleCols.includes(col)} onChange={() => toggleCol(col)} />
                        {col}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {filteredRows.length > 0 && (
                <button className="btn btn-secondary" onClick={() => downloadCSV(filteredRows, visibleCols, csvFilename)}>
                  Download CSV
                </button>
              )}
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="state-box">No orders match the current filters.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {visibleCols.map(col => (
                      <th key={col} onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                        {col}{sortField === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr key={i}>
                      {visibleCols.map(col => (
                        <td key={col} className={col === 'SKU' ? 'sku-cell' : ''}>
                          {col === 'Financial Status'
                            ? <span className={`status-badge fin-${row[col]}`}>{row[col]}</span>
                            : col === 'Fulfillment Status'
                            ? <span className={`status-badge ful-${row[col]}`}>{row[col]}</span>
                            : (row[col] ?? '')}
                        </td>
                      ))}
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
