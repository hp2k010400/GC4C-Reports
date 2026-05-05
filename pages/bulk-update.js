import { useState } from 'react'
import Link from 'next/link'

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.replace(/"/g, '').trim())
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

const EDITABLE = ['SKU', 'Price', 'Compare At Price', 'Title', 'Brand', 'Type', 'Status', 'Barcode', 'Tags']

export default function BulkUpdate() {
  const [rows, setRows] = useState(null)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = parseCSV(ev.target.result)
        setRows(parsed)
        setResult(null)
        setError(null)
      } catch {
        setError('Could not parse CSV — make sure it was exported from this tool.')
      }
    }
    reader.readAsText(file)
  }

  async function applyUpdates() {
    setApplying(true)
    setResult(null)
    setError(null)
    const res = await fetch('/api/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    })
    const json = await res.json()
    setApplying(false)
    if (!res.ok) setError(json.error)
    else setResult(json)
  }

  const columns = rows?.length ? Object.keys(rows[0]) : []

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-logo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <span className="header-title">GC4C Reports</span>
        </div>
        <span className="header-live">
          <span className="header-live-dot" />
          Live
        </span>
      </div>

      <div className="container">
        <Link href="/" className="back-link">← Back to reports</Link>

        <div className="page-title">Bulk Product Update</div>
        <div className="page-sub">
          Export the Product Export report, edit values in Excel, then upload the CSV here to push changes back to Shopify.
        </div>

        <div className="controls" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <div className="field">
            <label>Upload edited CSV</label>
            <input type="file" accept=".csv" onChange={handleFile} style={{ fontSize: 14 }} />
          </div>
          <p style={{ fontSize: 13, color: '#888' }}>
            Editable fields: {EDITABLE.join(', ')}. <strong>Variant ID</strong> must be present to match rows.
          </p>
        </div>

        {error && <div className="state-box error" style={{ marginBottom: 16, padding: '20px 24px', textAlign: 'left' }}>Error: {error}</div>}

        {result && (
          <div className="state-box success" style={{ marginBottom: 16, padding: '20px 24px', textAlign: 'left' }}>
            Done — {result.updated} variants updated, {result.skipped} skipped.
          </div>
        )}

        {rows && (
          <>
            <div className="results-bar">
              <span className="results-count">{rows.length} rows loaded</span>
              <button
                className="btn btn-primary"
                onClick={applyUpdates}
                disabled={applying}
              >
                {applying ? 'Applying…' : `Apply ${rows.length} updates to Shopify`}
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>{columns.map(col => <th key={col}>{col}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((row, i) => (
                    <tr key={i}>
                      {columns.map(col => (
                        <td key={col} className={col === 'SKU' ? 'sku-cell' : ''}>{row[col]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && (
                <div style={{ padding: '10px 14px', fontSize: 13, color: '#888' }}>
                  Showing first 50 of {rows.length} rows — all will be applied.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
