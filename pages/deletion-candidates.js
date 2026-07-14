import { useState, useEffect, useMemo } from 'react'
import { TYPE_GROUPS } from '../lib/typeGroups.js'

const CACHE_CHUNK_SIZE = 4000
const NINETY_DAYS_MS = 90 * 86400000

const EXCLUDED_TAGS   = ['new product', 'social media', 'nolo']
const EXCLUDED_TITLES = ['social media loan', 'sent for refurb', 'euan', 'trackman bay', 'template']

const COLS = ['Title', 'SKU', 'Variant', 'Brand', 'Type', 'Price', 'Inventory', 'Date Created']

function isDeletionCandidate(row, soldSkus) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  if (!row['Date Created'] || row['Date Created'] >= yesterday) return false
  if ((parseInt(row['Inventory']) || 0) !== 0) return false
  if (!String(row['SKU'] || '').includes('-')) return false

  const tags  = String(row['Tags']  || '').toLowerCase()
  const title = String(row['Title'] || '').toLowerCase()

  if (EXCLUDED_TAGS.some(t => tags.includes(t)))     return false
  if (EXCLUDED_TITLES.some(t => title.includes(t)))  return false
  if (soldSkus.has(String(row['SKU'] || '').trim()))  return false

  return true
}

function toCSV(rows) {
  return [
    COLS.join(','),
    ...rows.map(row =>
      COLS.map(col => {
        const val = String(row[col] ?? '')
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"` : val
      }).join(',')
    ),
  ].join('\n')
}

function downloadCSV(rows) {
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `deletion-candidates-${date}.csv`; a.click()
  URL.revokeObjectURL(url)
}

async function writeProductsCache(rows) {
  const totalChunks = Math.ceil(rows.length / CACHE_CHUNK_SIZE)
  for (let i = 0; i < totalChunks; i++) {
    const chunk = rows.slice(i * CACHE_CHUNK_SIZE, (i + 1) * CACHE_CHUNK_SIZE)
    await fetch('/api/products-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'chunk', chunk: i, rows: chunk, scope: 'active' }),
    })
  }
  await fetch('/api/products-cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'meta', totalChunks, count: rows.length, scope: 'active' }),
  })
}

const ONE_YEAR_AGO = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
const THREE_MONTHS_AGO = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)

export default function DeletionCandidatesPage() {
  const [phase, setPhase] = useState(null)
  const [productCount, setProductCount] = useState(0)
  const [orderCount, setOrderCount] = useState(0)
  const [candidates, setCandidates] = useState(null)
  const [error, setError] = useState(null)
  const [sortField, setSortField] = useState('Date Created')
  const [sortDir, setSortDir] = useState('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterType, setFilterType] = useState('')
  const [liveVendors, setLiveVendors] = useState([])
  const [preRunVendor, setPreRunVendor] = useState('')
  const [preRunType, setPreRunType] = useState('')
  const [createdAfter, setCreatedAfter] = useState('')
  const [createdBefore, setCreatedBefore] = useState(ONE_YEAR_AGO)
  const [activePreset, setActivePreset] = useState('older1year')

  useEffect(() => {
    fetch('/api/vendors')
      .then(r => r.json())
      .then(d => setLiveVendors(d.vendors || []))
      .catch(() => {})
  }, [])

  async function fetchAllProducts() {
    try {
      const metaRes = await fetch('/api/products-cache?meta=1&scope=active')
      const meta = metaRes ? await metaRes.json() : {}
      if (meta.hit && meta.totalChunks > 0) {
        const chunks = await Promise.all(
          Array.from({ length: meta.totalChunks }, (_, i) =>
            fetch(`/api/products-cache?chunk=${i}&scope=active`).then(r => r.json()).then(d => d.rows || [])
          )
        )
        const rows = chunks.flat()
        setProductCount(rows.length)
        return { rows, fromCache: true }
      }
    } catch {}

    let rows = []
    let pageInfo = null
    do {
      const params = new URLSearchParams()
      if (pageInfo) params.set('page_info', pageInfo)
      if (preRunVendor) params.set('vendor', preRunVendor)
      if (preRunType) {
        const typeVariants = TYPE_GROUPS[preRunType] || [preRunType]
        params.set('productType', typeVariants[0])
      }
      const res = await fetch(`/api/products-zero-stock?${params}`)
      let json
      try { json = await res.json() } catch {
        throw new Error('Products took too long to load')
      }
      if (!res.ok) throw new Error(json.error)
      rows = rows.concat(json.rows)
      pageInfo = json.nextPageInfo
      setProductCount(rows.length)
    } while (pageInfo)
    return { rows, fromCache: false }
  }

  async function fetchSoldSkus() {
    try {
      const cacheRes = await fetch('/api/sold-skus-cache')
      const cache = await cacheRes.json()
      if (cache.hit && cache.skus) {
        const skuSet = new Set(cache.skus)
        setOrderCount(skuSet.size)
        return skuSet
      }
    } catch {}

    const startDate = new Date(Date.now() - NINETY_DAYS_MS).toISOString().slice(0, 10)
    const endDate   = new Date().toISOString().slice(0, 10)
    const soldSkus  = new Set()
    let pageInfo = null
    do {
      const params = new URLSearchParams()
      if (pageInfo) {
        params.set('page_info', pageInfo)
      } else {
        params.set('startDate', startDate)
        params.set('endDate', endDate)
      }
      const res = await fetch(`/api/orders-skus?${params}`)
      let json
      try { json = await res.json() } catch {
        throw new Error('Orders took too long to load')
      }
      if (!res.ok) throw new Error(json.error)
      for (const sku of json.skus || []) {
        soldSkus.add(sku)
      }
      pageInfo = json.nextPageInfo
      setOrderCount(soldSkus.size)
    } while (pageInfo)

    fetch('/api/sold-skus-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus: [...soldSkus] }),
    }).catch(() => {})

    return soldSkus
  }

  function downloadDeleteList(rows) {
    const csv = ['Product Variant ID,Product SKU,Command', ...rows.map(r => `${r['Variant ID'] || ''},${r['SKU'] || ''},DELETE`)].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `delete-list-${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function runReport() {
    setError(null)
    setCandidates(null)
    setProductCount(0)
    setOrderCount(0)
    setSearchQuery('')

    try {
      setPhase('products')
      const { rows: productRows, fromCache } = await fetchAllProducts()
      if (!fromCache) {
        writeProductsCache(productRows).catch(() => {})
        // Live product fetch just drained Shopify's rate-limit bucket — give it
        // a moment to refill before hammering the orders API, or the first
        // orders-skus call gets throttled, retries, and blows Netlify's 10s limit.
        await new Promise(r => setTimeout(r, 2000))
      }

      setPhase('orders')
      const soldSkus = await fetchSoldSkus()

      setPhase('filtering')
      const result = productRows.filter(row => isDeletionCandidate(row, soldSkus))
      setCandidates(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setPhase(null)
    }
  }

  const uniqueBrands = useMemo(() => {
    if (!candidates) return []
    return [...new Set(candidates.map(r => r['Brand']).filter(Boolean))].sort()
  }, [candidates])

  const uniqueTypes = useMemo(() => {
    if (!candidates) return []
    return [...new Set(candidates.map(r => r['Type']).filter(Boolean))].sort()
  }, [candidates])

  const displayRows = useMemo(() => {
    if (!candidates) return []
    let rows = candidates
    if (createdAfter)  rows = rows.filter(r => r['Date Created'] && r['Date Created'] >= createdAfter)
    if (createdBefore) rows = rows.filter(r => r['Date Created'] && r['Date Created'] < createdBefore)
    if (filterBrand)   rows = rows.filter(r => r['Brand'] === filterBrand)
    if (filterType)    rows = rows.filter(r => r['Type']  === filterType)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      rows = rows.filter(row => Object.values(row).some(v => String(v ?? '').toLowerCase().includes(q)))
    }
    if (sortField) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortField] ?? ''
        const bv = b[sortField] ?? ''
        const na = parseFloat(String(av))
        const nb = parseFloat(String(bv))
        if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      })
    }
    return rows
  }, [candidates, searchQuery, sortField, sortDir, filterBrand, filterType, createdAfter, createdBefore])

  function handleSort(col) {
    if (sortField === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(col); setSortDir('asc') }
  }

  const loading = phase !== null

  const phaseLabel = {
    products:  `Loading products… ${productCount.toLocaleString()} loaded`,
    orders:    `Loading 90 days of orders… ${orderCount.toLocaleString()} sold SKUs found so far`,
    filtering: 'Applying Neil\'s criteria…',
  }[phase] || ''

  return (
    <div className="container">
      <div className="page-title">Deletion Candidates</div>
      <div className="page-sub">
        Products that are out of stock and haven't sold in the last 90 days — automatically filtered by Neil's criteria. Run the report, review, download CSV.
      </div>

      <div className="combined-notice">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Criteria: inventory = 0 · not sold in 90 days · SKU contains "-" · excludes New Product / Social Media / Nolo tags · excludes loan/refurb/template titles
      </div>

      <div className="controls" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>Brand (pre-filter)</label>
          <select className="type-select" value={preRunVendor} onChange={e => setPreRunVendor(e.target.value)}>
            <option value="">All brands</option>
            {liveVendors.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Type (pre-filter)</label>
          <select className="type-select" value={preRunType} onChange={e => setPreRunType(e.target.value)}>
            <option value="">All types</option>
            {Object.keys(TYPE_GROUPS).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="load-bar">
        <button className="btn btn-primary" onClick={runReport} disabled={loading}>
          {loading ? 'Running…' : candidates ? 'Re-run Report' : 'Run Report'}
        </button>
        {candidates && !loading && (
          <span className="load-count">{candidates.length.toLocaleString()} deletion candidates</span>
        )}
      </div>

      {loading && (
        <div className="state-box">
          <div className="spinner" />
          <div style={{ fontWeight: 500 }}>{phaseLabel}</div>
          {phase === 'orders' && (
            <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>
              90 days of orders — this takes a few minutes. Products are loading from cache.
            </div>
          )}
        </div>
      )}

      {error && <div className="state-box error">Error: {error}</div>}

      {candidates && !loading && (
        <>
          {candidates.length === 0 ? (
            <div className="state-box">No deletion candidates found.</div>
          ) : (
            <>
              <div className="stats-bar">
                <div className="stat-card">
                  <div className="stat-label">Match criteria (no date filter)</div>
                  <div className="stat-value">{candidates.length.toLocaleString()}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">After filters applied</div>
                  <div className="stat-value">{displayRows.length.toLocaleString()}</div>
                </div>
              </div>

              <div className="controls" style={{ marginBottom: 12 }}>
                <div style={{ flexBasis: '100%', display: 'flex', gap: 6, marginBottom: 4 }}>
                  <button
                    className={`preset-btn${activePreset === 'last3months' ? ' preset-btn-active' : ''}`}
                    onClick={() => { setCreatedAfter(THREE_MONTHS_AGO); setCreatedBefore(''); setActivePreset('last3months') }}
                  >Last 3 months</button>
                  <button
                    className={`preset-btn${activePreset === 'older1year' ? ' preset-btn-active' : ''}`}
                    onClick={() => { setCreatedAfter(''); setCreatedBefore(ONE_YEAR_AGO); setActivePreset('older1year') }}
                  >Older than 1 year</button>
                </div>
                <div className="field">
                  <label>Created from</label>
                  <input
                    type="date"
                    value={createdAfter}
                    onChange={e => { setCreatedAfter(e.target.value); setActivePreset(null) }}
                    style={{ padding: '8px 12px', border: '1px solid #d4d4d4', borderRadius: 7, fontSize: 14 }}
                  />
                </div>
                <div className="field">
                  <label>Created before</label>
                  <input
                    type="date"
                    value={createdBefore}
                    onChange={e => { setCreatedBefore(e.target.value); setActivePreset(null) }}
                    style={{ padding: '8px 12px', border: '1px solid #d4d4d4', borderRadius: 7, fontSize: 14 }}
                  />
                </div>
                <div className="field">
                  <label>Brand</label>
                  <select className="type-select" value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
                    <option value="">All brands</option>
                    {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Type</label>
                  <select className="type-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="">All types</option>
                    {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {(createdAfter || createdBefore !== ONE_YEAR_AGO || filterBrand || filterType) && (
                  <button className="btn btn-secondary" onClick={() => { setCreatedAfter(''); setCreatedBefore(ONE_YEAR_AGO); setFilterBrand(''); setFilterType(''); setActivePreset('older1year') }}>
                    Reset filters
                  </button>
                )}
              </div>

              <div className="search-bar">
                <input
                  className="search-input"
                  type="text"
                  placeholder="Search across all fields…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>
                )}
              </div>

              <div className="results-bar">
                <span className="results-count">
                  {displayRows.length.toLocaleString()} of {candidates.length.toLocaleString()} candidates
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => downloadCSV(displayRows)}>
                    Download CSV
                  </button>
                  <button className="btn btn-primary" onClick={() => downloadDeleteList(displayRows)}>
                    Download Delete List ({displayRows.length.toLocaleString()})
                  </button>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {COLS.map(col => (
                        <th key={col} onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                          {col}{sortField === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row, i) => (
                      <tr key={i}>
                        {COLS.map(col => (
                          <td key={col} className={col === 'SKU' ? 'sku-cell' : ''}>
                            {row[col] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
