import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { reports } from '../../lib/reports/index.js'

export async function getStaticPaths() {
  return {
    paths: Object.keys(reports).map(slug => ({ params: { slug } })),
    fallback: false,
  }
}

export async function getStaticProps({ params }) {
  const report = reports[params.slug]
  const { TYPE_GROUPS } = await import('../../lib/typeGroups.js')
  const { VENDOR_GROUPS } = await import('../../lib/vendorGroups.js')
  return {
    props: {
      slug: params.slug,
      name: report.name,
      description: report.description,
      requiresDates: report.requiresDates,
      supportsTypeFilter: report.supportsTypeFilter || false,
      supportsVendorFilter: report.supportsVendorFilter || false,
      supportsLocationStock: report.supportsLocationStock || false,
      typeOptions: report.supportsTypeFilter ? Object.keys(TYPE_GROUPS) : [],
      typeGroups: report.supportsTypeFilter ? TYPE_GROUPS : {},
      vendorOptions: report.supportsVendorFilter ? Object.keys(VENDOR_GROUPS) : [],
      vendorGroups: report.supportsVendorFilter ? VENDOR_GROUPS : {},
    },
  }
}

function toCSV(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = String(row[h] ?? '')
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val
      }).join(',')
    ),
  ].join('\n')
}

function downloadCSV(rows, filename) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function saveHistory(entry) {
  try {
    const hist = JSON.parse(localStorage.getItem('gc4c_history') || '[]')
    hist.unshift(entry)
    localStorage.setItem('gc4c_history', JSON.stringify(hist.slice(0, 50)))
  } catch {}
}

export default function ReportPage({ slug, name, description, requiresDates, supportsTypeFilter, supportsVendorFilter, supportsLocationStock, typeOptions = [], typeGroups = {}, vendorOptions = [], vendorGroups = {} }) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(thirtyDaysAgo)
  const [endDate, setEndDate] = useState(today)
  const [productType, setProductType] = useState('')
  const [vendor, setVendor] = useState('')
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [autorunPending, setAutorunPending] = useState(false)

  const [locationRows, setLocationRows] = useState(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState(null)
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState('')

  useEffect(() => {
    if (supportsLocationStock) {
      fetch('/api/locations').then(r => r.json()).then(d => setLocations(d.locations || [])).catch(() => {})
    }
  }, [supportsLocationStock])

  useEffect(() => {
    if (!router.isReady) return
    if (router.query.start) setStartDate(router.query.start)
    if (router.query.end) setEndDate(router.query.end)
    if (router.query.autorun === '1') setAutorunPending(true)
  }, [router.isReady, router.query])

  useEffect(() => {
    if (autorunPending) {
      setAutorunPending(false)
      runReport()
    }
  }, [autorunPending]) // eslint-disable-line


  async function loadLocationStock(rowsData, locFilter) {
    setLocationLoading(true)
    setLocationError(null)
    try {
      const ids = [...new Set(rowsData.map(r => r._inventoryItemId).filter(Boolean))]
      const levRes = await fetch('/api/inventory-levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then(r => r.json())
      let locs = locations.length ? locations : (await fetch('/api/locations').then(r => r.json()).then(d => d.locations || []))
      locs = locs.sort((a, b) => a.name.localeCompare(b.name))
      if (locFilter) locs = locs.filter(l => String(l.id) === locFilter)
      const levelMap = {}
      for (const l of (levRes.levels || [])) {
        if (!levelMap[l.inventory_item_id]) levelMap[l.inventory_item_id] = {}
        levelMap[l.inventory_item_id][l.location_id] = l.available ?? 0
      }
      const merged = rowsData.map(({ _inventoryItemId, Available, ...rest }) => {
        const byLoc = locs.reduce((acc, loc) => {
          acc[loc.name] = levelMap[_inventoryItemId]?.[loc.id] ?? 0
          return acc
        }, {})
        return { ...rest, ...byLoc }
      })
      setLocationRows(merged)
    } catch (err) {
      setLocationError(err.message)
    } finally {
      setLocationLoading(false)
    }
  }

  async function runReport() {
    setLoading(true)
    setError(null)
    setRows(null)
    setLocationRows(null)
    setLocationError(null)
    setProgress({ count: 0 })

    const typeVariants = productType && supportsTypeFilter
      ? (typeGroups[productType] || [productType])
      : [null]
    const vendorVariants = vendor && supportsVendorFilter
      ? (vendorGroups[vendor] || [vendor])
      : [null]

    let allRows = []

    try {
      for (const typeVariant of typeVariants) {
        for (const vendorVariant of vendorVariants) {
          let pageInfo = null
          do {
            const params = new URLSearchParams()
            if (requiresDates) {
              params.set('startDate', startDate)
              params.set('endDate', endDate)
            }
            if (typeVariant) params.set('productType', typeVariant)
            if (vendorVariant) params.set('vendor', vendorVariant)
            if (pageInfo) params.set('page_info', pageInfo)

            const res = await fetch(`/api/reports/${slug}?${params}`)
            let json
            try {
              json = await res.json()
            } catch {
              throw new Error('Request timed out — try a specific product type to reduce the data size')
            }

            if (!res.ok) {
              setError(json.error || 'Server error')
              return
            }

            allRows = allRows.concat(json.rows)
            pageInfo = json.nextPageInfo
            setProgress({ count: allRows.length })
          } while (pageInfo)
        }
      }

      setRows(allRows)
      if (supportsLocationStock && allRows.length) loadLocationStock(allRows, selectedLocation)
      saveHistory({
        type: 'report',
        slug,
        name,
        startDate: requiresDates ? startDate : null,
        endDate: requiresDates ? endDate : null,
        rowCount: allRows.length,
        ts: new Date().toISOString(),
      })
    } catch (err) {
      setError('Network error: ' + err.message)
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const displayRows = locationRows || rows
  const columns = displayRows?.length ? Object.keys(displayRows[0]).filter(k => !k.startsWith('_')) : []
  const csvFilename = requiresDates
    ? `${slug}-${startDate}-to-${endDate}.csv`
    : `${slug}-${new Date().toISOString().slice(0, 10)}.csv`

  return (
    <div className="container">
      <Link href="/" className="back-link">← Reports</Link>

      <div className="page-title">{name}</div>
      <div className="page-sub">{description}</div>

      <div className="controls">
        {requiresDates && (
          <>
            <div style={{ flexBasis: '100%', display: 'flex', gap: 6, marginBottom: 4 }}>
              {[7, 30, 90].map(d => (
                <button key={d} className="preset-btn" onClick={() => {
                  setEndDate(new Date().toISOString().slice(0, 10))
                  setStartDate(new Date(Date.now() - d * 86400000).toISOString().slice(0, 10))
                }}>
                  Last {d} days
                </button>
              ))}
            </div>
            <div className="field">
              <label>From</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={endDate} />
            </div>
            <div className="field">
              <label>To</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} max={today} />
            </div>
            {startDate && endDate && (
              <div className="date-range-label">
                {Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1} days
              </div>
            )}
          </>
        )}
        {supportsTypeFilter && (
          <div className="field">
            <label>Product Type</label>
            <select
              value={productType}
              onChange={e => setProductType(e.target.value)}
              className="type-select"
            >
              <option value="">All types</option>
              {typeOptions.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}
        {supportsVendorFilter && (
          <div className="field">
            <label>Brand</label>
            <select
              value={vendor}
              onChange={e => setVendor(e.target.value)}
              className="type-select"
            >
              <option value="">All brands</option>
              {vendorOptions.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        )}
        {supportsLocationStock && locations.length > 0 && (
          <div className="field">
            <label>Location</label>
            <select
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              className="type-select"
            >
              <option value="">All locations</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
        <button className="btn btn-primary" onClick={runReport} disabled={loading}>
          {loading ? 'Loading…' : 'Generate Report'}
        </button>
        {rows?.length > 0 && (
          <button className="btn btn-secondary" onClick={() => downloadCSV(rows, csvFilename)}>
            Download CSV
          </button>
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
              {requiresDates
                ? 'Large date ranges may take a moment'
                : (productType || vendor)
                  ? 'Filtering products — this may take a moment'
                  : 'Fetching all products — this may take a moment'}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="state-box error">Error: {error}</div>
      )}

      {rows && !loading && (
        <>
          <div className="results-bar">
            <span className="results-count">{(displayRows || rows).length.toLocaleString()} rows</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {locationLoading && (
                <span style={{ fontSize: 12, color: '#888' }}>Loading location stock…</span>
              )}
              {rows.length > 0 && (
                <button className="btn btn-secondary" onClick={() => downloadCSV(locationRows || rows, csvFilename)}>
                  Download CSV
                </button>
              )}
            </div>
          </div>

          {locationError && <div className="state-box error">Location stock error: {locationError}</div>}

          {rows.length === 0 ? (
            <div className="state-box">No data found for this period.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>{columns.map(col => <th key={col}>{col}</th>)}</tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => (
                    <tr key={i}>
                      {columns.map(col => (
                        <td key={col} className={col === 'SKU' ? 'sku-cell' : ''}>{row[col]}</td>
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
