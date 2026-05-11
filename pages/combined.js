import { useState, useEffect, useMemo } from 'react'
import { COMBINED_FIELDS, CONDITIONS, applyFilters, needsValue } from '../lib/filterEngine.js'
import { TYPE_GROUPS } from '../lib/typeGroups.js'
import { VENDOR_GROUPS } from '../lib/vendorGroups.js'

let _cache = null

const DEFAULT_COLS = ['Title', 'SKU', 'Variant', 'Type', 'Brand', 'Status', 'Inventory', 'Units Sold', 'Revenue', 'Last Sold']
const ALL_COLS = [
  'Title', 'SKU', 'Variant', 'Type', 'Brand', 'Status',
  'Price', 'Compare At', 'Inventory',
  'Units Sold', 'Revenue', 'Orders', 'Last Sold', 'Date Created', 'Tags',
]

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

function getFieldDef(key) {
  return COMBINED_FIELDS.find(f => f.key === key)
}

function joinData(productRows, orderRows) {
  const salesMap = new Map()
  for (const row of orderRows) {
    const sku = String(row['SKU'] || '').trim()
    if (!sku) continue
    if (!salesMap.has(sku)) {
      salesMap.set(sku, { unitsSold: 0, revenue: 0, orderNums: new Set(), lastSold: '' })
    }
    const s = salesMap.get(sku)
    s.unitsSold += parseInt(row['Qty']) || 0
    s.revenue   += parseFloat(row['Line Total']) || 0
    s.orderNums.add(row['Order'])
    if (!s.lastSold || row['Date'] > s.lastSold) s.lastSold = row['Date']
  }

  return productRows.map(p => {
    const sku = String(p['SKU'] || '').trim()
    const s = sku ? salesMap.get(sku) : null
    return {
      ...p,
      'Units Sold': s ? s.unitsSold      : 0,
      'Revenue':    s ? s.revenue.toFixed(2) : '0.00',
      'Orders':     s ? s.orderNums.size  : 0,
      'Last Sold':  s ? s.lastSold        : '',
    }
  })
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

export default function CombinedPage() {
  const [allRows, setAllRows] = useState(_cache?.rows ?? null)
  const [phase, setPhase] = useState(null)
  const [productCount, setProductCount] = useState(0)
  const [orderCount, setOrderCount] = useState(0)
  const [error, setError] = useState(null)

  const [startDate, setStartDate] = useState(_cache?.startDate ?? daysAgo(30))
  const [endDate, setEndDate] = useState(_cache?.endDate ?? today())
  const [preType, setPreType] = useState(_cache?.preType ?? '')
  const [preVendor, setPreVendor] = useState(_cache?.preVendor ?? '')

  const [filters, setFilters] = useState(_cache?.filters ?? [])
  const [filterLogic, setFilterLogic] = useState(_cache?.filterLogic ?? 'AND')
  const [sortField, setSortField] = useState(_cache?.sortField ?? 'Units Sold')
  const [sortDir, setSortDir] = useState(_cache?.sortDir ?? 'desc')
  const [visibleCols, setVisibleCols] = useState(_cache?.visibleCols ?? DEFAULT_COLS)
  const [showColPicker, setShowColPicker] = useState(false)
  const [savedViews, setSavedViews] = useState([])
  const [viewName, setViewName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  useEffect(() => {
    try { setSavedViews(JSON.parse(localStorage.getItem('gc4c_combined_views') || '[]')) } catch {}
  }, [])

  useEffect(() => {
    if (allRows) {
      _cache = { rows: allRows, startDate, endDate, preType, preVendor, filters, filterLogic, sortField, sortDir, visibleCols }
    }
  }, [allRows, startDate, endDate, preType, preVendor, filters, filterLogic, sortField, sortDir, visibleCols])

  async function fetchAllProducts() {
    const queryType   = preType   ? (TYPE_GROUPS[preType]?.[0]   ?? preType)   : null
    const queryVendor = preVendor ? (VENDOR_GROUPS[preVendor]?.[0] ?? preVendor) : null
    let rows = []
    let pageInfo = null
    do {
      const params = new URLSearchParams()
      if (queryType)   params.set('product_type', queryType)
      if (queryVendor) params.set('vendor', queryVendor)
      if (pageInfo)  params.set('page_info', pageInfo)
      const res = await fetch(`/api/products-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      rows = rows.concat(json.rows)
      pageInfo = json.nextPageInfo
      setProductCount(rows.length)
    } while (pageInfo)
    return rows
  }

  async function fetchAllOrders() {
    let rows = []
    let pageInfo = null
    do {
      const params = new URLSearchParams()
      params.set('mode', 'combined')
      if (pageInfo) {
        params.set('page_info', pageInfo)
      } else {
        params.set('startDate', startDate)
        params.set('endDate', endDate)
      }
      const res = await fetch(`/api/orders-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      rows = rows.concat(json.rows)
      pageInfo = json.nextPageInfo
      setOrderCount(rows.length)
    } while (pageInfo)
    return rows
  }

  async function loadCombined() {
    setError(null)
    setAllRows(null)
    setFilters([])
    setSortField('Units Sold')
    setSortDir('desc')
    setProductCount(0)
    setOrderCount(0)

    try {
      setPhase('loading')
      const productRows = await fetchAllProducts()
      const orderRows = await fetchAllOrders()

      setPhase('joining')
      const combined = joinData(productRows, orderRows)
      setAllRows(combined)
    } catch (err) {
      setError(err.message)
    } finally {
      setPhase(null)
    }
  }

  const loading = phase !== null

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
    else { setSortField(col); setSortDir('desc') }
  }

  function toggleCol(col) {
    setVisibleCols(cols => cols.includes(col) ? cols.filter(c => c !== col) : [...cols, col])
  }

  function saveView() {
    if (!viewName.trim()) return
    const views = [
      { id: Date.now(), name: viewName.trim(), filters, filterLogic, visibleCols },
      ...savedViews,
    ].slice(0, 20)
    localStorage.setItem('gc4c_combined_views', JSON.stringify(views))
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
    localStorage.setItem('gc4c_combined_views', JSON.stringify(views))
    setSavedViews(views)
  }

  const activeFilters = filters.filter(f => f.field && f.condition)
  const dayCount = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1
  const csvFilename = `combined-${startDate}-to-${endDate}.csv`

  const phaseLabel = phase === 'loading'
    ? `Products: ${productCount.toLocaleString()} variants · Orders: ${orderCount.toLocaleString()} line items`
    : phase === 'joining'
    ? 'Joining product and order data…'
    : ''

  return (
    <div className="container">
      <div className="page-title">Combined Report</div>
      <div className="page-sub">
        Current stock levels + sales data in one view — the only place you can ask "what's selling and what do I have left?" Filter by inventory, units sold, revenue, last sold date and more.
      </div>

      <div className="combined-notice">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Sales figures are for the selected date range only. Inventory is always live.
      </div>

      <div className="load-bar">
        <div className="field">
          <label>Orders from</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={endDate} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} max={today()} />
        </div>
        <div className="date-range-label">{dayCount} days</div>
        <select value={preType} onChange={e => setPreType(e.target.value)} className="type-select">
          <option value="">All types</option>
          {Object.keys(TYPE_GROUPS).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={preVendor} onChange={e => setPreVendor(e.target.value)} className="type-select">
          <option value="">All brands</option>
          {Object.keys(VENDOR_GROUPS).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <button className="btn btn-primary" onClick={loadCombined} disabled={loading}>
          {loading ? 'Loading…' : allRows ? 'Reload' : 'Generate Combined Report'}
        </button>
        {allRows && !loading && (
          <span className="load-count">{allRows.length.toLocaleString()} variants</span>
        )}
      </div>

      {loading && (
        <div className="state-box">
          <div className="spinner" />
          <div style={{ fontWeight: 500 }}>
            {phase === 'joining' ? 'Joining product and order data…' : 'Fetching products & orders simultaneously…'}
          </div>
          {phase === 'loading' && (
            <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>{phaseLabel}</div>
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
                    {COMBINED_FIELDS.map(fd => <option key={fd.key} value={fd.key}>{fd.label}</option>)}
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
              {filteredRows.length.toLocaleString()} of {allRows.length.toLocaleString()} variants
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
                    <input className="filter-value" placeholder="View name…" value={viewName}
                      onChange={e => setViewName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveView()} autoFocus />
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={saveView}>Save</button>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowSaveInput(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowSaveInput(true)}>Save view</button>
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
            <div className="state-box">No products match the current filters.</div>
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
                          {col === 'Status'
                            ? <span className={`status-badge status-${row[col]}`}>{row[col]}</span>
                            : col === 'Revenue'
                            ? `£${row[col]}`
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
