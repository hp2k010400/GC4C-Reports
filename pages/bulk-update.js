import { useState } from 'react'
import Link from 'next/link'

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
  return lines.slice(1).map(line => {
    const vals = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes
      } else if (line[i] === ',' && !inQuotes) {
        vals.push(current.trim())
        current = ''
      } else {
        current += line[i]
      }
    }
    vals.push(current.trim())
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

function saveHistory(entry) {
  try {
    const hist = JSON.parse(localStorage.getItem('gc4c_history') || '[]')
    hist.unshift(entry)
    localStorage.setItem('gc4c_history', JSON.stringify(hist.slice(0, 50)))
  } catch {}
}

const EDITABLE = ['SKU', 'Price', 'Compare At Price', 'Title', 'Brand', 'Type', 'Status', 'Barcode', 'Tags']

export default function BulkUpdate() {
  const [rows, setRows] = useState(null)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
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
    try {
      const res = await fetch('/api/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const json = await res.json()
      setApplying(false)
      if (!res.ok) {
        setError(json.error)
      } else {
        setResult(json)
        saveHistory({
          type: 'bulk-edit',
          name: fileName || 'Bulk Product Update',
          rowCount: rows.length,
          updated: json.updated,
          skipped: json.skipped,
          ts: new Date().toISOString(),
        })
      }
    } catch (err) {
      setApplying(false)
      setError('Network error: ' + err.message)
    }
  }

  const columns = rows?.length ? Object.keys(rows[0]) : []

  return (
    <div className="container">
      <Link href="/" className="back-link">← Reports</Link>

      <div className="page-header">
        <div>
          <div className="page-title">Bulk Product Update</div>
          <div className="page-sub">
            Export the Product Export report, edit values in Excel or Google Sheets, then upload the CSV here to push changes back to Shopify.
          </div>
        </div>
        <Link href="/reports/product-export" className="btn btn-secondary">
          Export products first →
        </Link>
      </div>

      <div className="bulk-workflow">
        <div className="workflow-step">
          <div className="workflow-step-num">1</div>
          <div>
            <div className="workflow-step-title">Export</div>
            <div className="workflow-step-desc">Download Product Export CSV</div>
          </div>
        </div>
        <div className="workflow-arrow">→</div>
        <div className="workflow-step">
          <div className="workflow-step-num">2</div>
          <div>
            <div className="workflow-step-title">Edit</div>
            <div className="workflow-step-desc">Modify in Excel or Sheets</div>
          </div>
        </div>
        <div className="workflow-arrow">→</div>
        <div className="workflow-step workflow-step-active">
          <div className="workflow-step-num">3</div>
          <div>
            <div className="workflow-step-title">Upload</div>
            <div className="workflow-step-desc">Push changes to Shopify</div>
          </div>
        </div>
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

      {error && (
        <div className="state-box error" style={{ marginBottom: 16, padding: '20px 24px', textAlign: 'left' }}>
          Error: {error}
        </div>
      )}

      {result && (
        <div className="state-box success" style={{ marginBottom: 16, padding: '20px 24px', textAlign: 'left' }}>
          <strong>Done</strong> — {result.updated.toLocaleString()} variants updated
          {result.skipped > 0 && `, ${result.skipped} skipped (no Variant ID)`}.
        </div>
      )}

      {rows && (
        <>
          <div className="results-bar">
            <span className="results-count">
              {rows.length.toLocaleString()} rows loaded
              {fileName && <span style={{ color: '#bbb', marginLeft: 8 }}>from {fileName}</span>}
            </span>
            <button
              className="btn btn-primary"
              onClick={applyUpdates}
              disabled={applying}
            >
              {applying ? 'Applying…' : `Apply ${rows.length.toLocaleString()} updates to Shopify`}
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
                Showing first 50 of {rows.length.toLocaleString()} rows — all will be applied.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
