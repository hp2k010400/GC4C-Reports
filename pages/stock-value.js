import { useState, useEffect } from 'react'

function toCSV(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [headers.join(','), ...rows.map(row => headers.map(h => {
    const v = String(row[h] ?? '')
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
  }).join(','))].join('\n')
}

function downloadCSV(rows, filename) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function money(n) {
  return `£${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function StockValuePage() {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [filterLocation, setFilterLocation] = useState('')

  useEffect(() => {
    fetch('/api/locations').then(r => r.json()).then(d => setLocations(d.locations || [])).catch(() => {})
  }, [])

  // Retries the same page as a fresh function call rather than failing
  // outright on a transient hiccup — same pattern used elsewhere in this app.
  async function fetchPageWithRetry(params, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`/api/stock-value?${params}`)
        let json
        try { json = await res.json() } catch {
          throw new Error('Stock value report took too long to load')
        }
        if (!res.ok) throw new Error(json.error)
        return json
      } catch (err) {
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, 1500 * (i + 1)))
          continue
        }
        throw err
      }
    }
  }

  async function runReport() {
    setLoading(true)
    setError(null)
    setRows(null)
    setProgress(0)
    try {
      let allRows = []
      let pageInfo = null
      do {
        const params = new URLSearchParams()
        if (pageInfo) params.set('page_info', pageInfo)
        const json = await fetchPageWithRetry(params)
        allRows = allRows.concat(json.rows)
        pageInfo = json.nextPageInfo
        setProgress(allRows.length)
      } while (pageInfo)
      setRows(allRows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredRows = rows
    ? (filterLocation ? rows.filter(r => String(r['Location ID']) === filterLocation) : rows)
    : []

  const totalValue = filteredRows.reduce((sum, r) => sum + r['On Hand'] * r['Unit Cost'], 0)
  const totalUnits = filteredRows.reduce((sum, r) => sum + r['On Hand'], 0)

  const perLocation = rows
    ? Object.values(rows.reduce((acc, r) => {
        const key = r['Location ID'] || 'unknown'
        if (!acc[key]) acc[key] = { name: r['Location'] || 'Unknown', value: 0, units: 0 }
        acc[key].value += r['On Hand'] * r['Unit Cost']
        acc[key].units += r['On Hand']
        return acc
      }, {})).sort((a, b) => b.value - a.value)
    : []

  function exportCSV() {
    if (!filteredRows.length) return
    const locName = filterLocation ? (locations.find(l => String(l.id) === filterLocation)?.name || 'location') : 'all-locations'
    const csvRows = filteredRows.map(r => ({
      SKU: r['SKU'],
      Title: r['Title'],
      Variant: r['Variant'],
      Brand: r['Brand'],
      Type: r['Type'],
      Location: r['Location'],
      'On Hand': r['On Hand'],
      'Unit Cost': r['Unit Cost'].toFixed(2),
      'Line Value': (r['On Hand'] * r['Unit Cost']).toFixed(2),
    }))
    downloadCSV(csvRows, `stock-value-${locName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div className="container">
      <div className="page-title">Stock Asset Value</div>
      <div className="page-sub">
        Total cost value of everything currently in stock (on hand) across all locations, or filtered to one branch.
      </div>

      <div className="load-bar">
        <button className="btn btn-primary" onClick={runReport} disabled={loading}>
          {loading ? 'Running…' : rows ? 'Re-run Report' : 'Run Report'}
        </button>
        {rows && !loading && (
          <span className="load-count">{rows.length.toLocaleString()} stock lines loaded</span>
        )}
      </div>

      {loading && (
        <div className="state-box">
          <div className="spinner" />
          <div style={{ fontWeight: 500 }}>Loading stock on hand… {progress.toLocaleString()} lines found so far</div>
        </div>
      )}

      {error && <div className="state-box error">Error: {error}</div>}

      {rows && !loading && (
        <>
          <div className="controls" style={{ marginBottom: 12 }}>
            <div className="field">
              <label>Location</label>
              <select className="type-select" value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
                <option value="">All locations (company total)</option>
                {locations.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
              </select>
            </div>
          </div>

          <div className="stats-bar">
            <div className="stat-card">
              <div className="stat-label">{filterLocation ? 'Stock Value — this location' : 'Total Stock Value — all locations'}</div>
              <div className="stat-value">{money(totalValue)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Units On Hand</div>
              <div className="stat-value">{totalUnits.toLocaleString()}</div>
            </div>
          </div>

          {!filterLocation && perLocation.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Location</th>
                    <th style={{ textAlign: 'right' }}>Units</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {perLocation.map(l => (
                    <tr key={l.name}>
                      <td>{l.name}</td>
                      <td style={{ textAlign: 'right' }}>{l.units.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>{money(l.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="results-bar" style={{ marginTop: 16 }}>
            <span className="results-count">{filteredRows.length.toLocaleString()} stock lines</span>
            <button className="btn btn-secondary" onClick={exportCSV}>Download CSV</button>
          </div>
        </>
      )}
    </div>
  )
}
