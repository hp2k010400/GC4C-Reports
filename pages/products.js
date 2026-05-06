import { useState, useEffect, useMemo } from 'react'
import { PRODUCT_FIELDS, CONDITIONS, applyFilters, needsValue } from '../lib/filterEngine.js'
import { TYPE_GROUPS } from '../lib/typeGroups.js'
import { VENDOR_GROUPS } from '../lib/vendorGroups.js'

const DEFAULT_COLS = ['Title', 'SKU', 'Variant', 'Type', 'Brand', 'Status', 'Price', 'Compare At', 'Inventory']
const ALL_COLS = [
  'Title', 'SKU', 'Variant', 'Type', 'Brand', 'Status',
  'Price', 'Compare At', 'Inventory', 'Barcode', 'Tags',
  'Date Created', 'Date Updated', 'Handle',
]

function getFieldDef(key) {
  return PRODUCT_FIELDS.find(f => f.key === key)
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

export default function ProductsPage() {
  const [allRows, setAllRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const [preType, setPreType] = useState('')
  const [preVendor, setPreVendor] = useState('')
  const [preStatus, setPreStatus] = useState('')

  const [filters, setFilters] = useState([])
  const [filterLogic, setFilterLogic] = useState('AND')

  const [sortField, setSortField] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const [visibleCols, setVisibleCols] = useState(DEFAULT_COLS)
  const [showColPicker, setShowColPicker] = useState(false)

  const [savedViews, setSavedViews] = useState([])
  const [viewName, setViewName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  useEffect(() => {
    try {
      setSavedViews(JSON.parse(localStorage.getItem('gc4c_product_views') || '[]'))
    } catch {}
  }, [])

  async function loadProducts() {
    setLoading(true)
    setError(null)
    setAllRows(null)
    setFilters([])
    setSortField(null)
    setProgress({ count: 0 })

    const queryType   = preType   ? (TYPE_GROUPS[preType]?.[0]   ?? preType)   : null
    const queryVendor = preVendor ? (VENDOR_GROUPS[preVendor]?.[0] ?? preVendor) : null
    let rows = []

    try {
      let pageInfo = null
      do {
        const params = new URLSearchParams()
        if (queryType)   params.set('product_type', queryType)
        if (queryVendor) params.set('vendor', queryVendor)
        if (preStatus)  params.set('status', preStatus)
        if (pageInfo)   params.set('page_info', pageInfo)

        const res = await fetch(`/api/products-data?${params}`)
        let json
        try { json = await res.json() } catch {
          throw new Error('Request timed out — try narrowing with Type or Brand first')
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
      { id: Date.now(), name: viewName.trim(), filters, filterLogic, visibleCols, preType, preVendor, preStatus },
      ...savedViews,
    ].slice(0, 20)
    localStorage.setItem('gc4c_product_views', JSON.stringify(views))
    setSavedViews(views)
    setViewName('')
    setShowSaveInput(false)
  }

  function loadView(view) {
    setFilters(view.filters || [])
    setFilterLogic(view.filterLogic || 'AND')
    setVisibleCols(view.visibleCols || DEFAULT_COLS)
    setPreType(view.preType || '')
    setPreVendor(view.preVendor || '')
    setPreStatus(view.preStatus || '')
  }

  function deleteView(id) {
    const views = savedViews.filter(v => v.id !== id)
    localStorage.setItem('gc4c_product_views', JSON.stringify(views))
    setSavedViews(views)
  }

  const csvFilename = `products-${new Date().toISOString().slice(0, 10)}.csv`

  return (
    <div className="container">
      <div className="page-title">Products</div>
      <div className="page-sub">
        Load your product catalogue then filter by any field. Narrow by type or brand first for faster loading.
      </div>

      {/* Pre-filters + load */}
      <div className="load-bar">
        <select value={preType} onChange={e => setPreType(e.target.value)} className="type-select">
          <option value="">All types</option>
          {Object.keys(TYPE_GROUPS).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={preVendor} onChange={e => setPreVendor(e.target.value)} className="type-select">
          <option value="">All brands</option>
          {Object.keys(VENDOR_GROUPS).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={preStatus} onChange={e => setPreStatus(e.target.value)} className="type-select">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <button className="btn btn-primary" onClick={loadProducts} disabled={loading}>
          {loading ? 'Loading…' : allRows ? 'Reload' : 'Load Products'}
        </button>
        {allRows && !loading && (
          <span className="load-count">{allRows.length.toLocaleString()} variants loaded</span>
        )}
      </div>

      {loading && (
        <div className="state-box">
          <div className="spinner" />
          <div style={{ fontWeight: 500 }}>
            {progress?.count > 0
              ? `Fetched ${progress.count.toLocaleString()} products — still going…`
              : 'Connecting to Shopify…'}
          </div>
          {progress?.count > 0 && (
            <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>
              {preType || preVendor ? 'Filtering products — this may take a moment' : 'Fetching all products — this may take a moment'}
            </div>
          )}
        </div>
      )}

      {error && <div className="state-box error">Error: {error}</div>}

      {allRows && !loading && (
        <>
          {/* Saved views */}
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

          {/* Filter builder */}
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
                    {PRODUCT_FIELDS.map(fd => <option key={fd.key} value={fd.key}>{fd.label}</option>)}
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

          {/* Results bar */}
          <div className="results-bar">
            <span className="results-count">
              {filteredRows.length.toLocaleString()} of {allRows.length.toLocaleString()} variants
              {filters.filter(f => f.field && f.condition).length > 0 && (
                <span style={{ color: '#888', marginLeft: 6 }}>
                  ({filters.filter(f => f.field && f.condition).length} filter{filters.filter(f => f.field && f.condition).length > 1 ? 's' : ''} active)
                </span>
              )}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {filters.filter(f => f.field && f.condition).length > 0 && (
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
