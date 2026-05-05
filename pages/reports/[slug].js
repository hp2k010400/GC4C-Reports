import { useState } from 'react'
import Link from 'next/link'
import { reports } from '../../lib/reports/index.js'

export async function getStaticPaths() {
  return {
    paths: Object.keys(reports).map(slug => ({ params: { slug } })),
    fallback: false,
  }
}

export async function getStaticProps({ params }) {
  const report = reports[params.slug]
  return {
    props: {
      slug: params.slug,
      name: report.name,
      description: report.description,
      requiresDates: report.requiresDates,
    },
  }
}

function toCSV(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = String(row[h] ?? '')
        return val.includes(',') ? `"${val}"` : val
      }).join(',')
    ),
  ]
  return lines.join('\n')
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

export default function ReportPage({ slug, name, description, requiresDates }) {
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(thirtyDaysAgo)
  const [endDate, setEndDate] = useState(today)
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function runReport() {
    setLoading(true)
    setError(null)
    setRows(null)

    const params = new URLSearchParams({ startDate, endDate })
    const res = await fetch(`/api/reports/${slug}?${params}`)
    const json = await res.json()

    setLoading(false)
    if (!res.ok) {
      setError(json.error)
    } else {
      setRows(json.data)
    }
  }

  const columns = rows?.length ? Object.keys(rows[0]) : []

  return (
    <>
      <div className="header">
        <span className="header-title">GC4C Reports</span>
        <span className="header-sub">Live data — direct from Shopify</span>
      </div>

      <div className="container">
        <Link href="/" className="back-link">← Back to reports</Link>

        <div className="page-title">{name}</div>
        <div className="page-sub">{description}</div>

        <div className="controls">
          {requiresDates && (
            <>
              <div className="field">
                <label>From</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={endDate} />
              </div>
              <div className="field">
                <label>To</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} max={today} />
              </div>
            </>
          )}
          <button className="btn btn-primary" onClick={runReport} disabled={loading}>
            {loading ? 'Loading…' : 'Generate Report'}
          </button>
          {rows?.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={() => downloadCSV(rows, `${slug}-${startDate}-to-${endDate}.csv`)}
            >
              Download CSV
            </button>
          )}
        </div>

        {loading && (
          <div className="state-box">
            <div className="spinner" />
            <div>Fetching live data from Shopify…</div>
          </div>
        )}

        {error && (
          <div className="state-box error">Error: {error}</div>
        )}

        {rows && !loading && (
          <>
            <div className="results-bar">
              <span className="results-count">{rows.length.toLocaleString()} rows</span>
              {rows.length > 0 && (
                <button
                  className="btn btn-secondary"
                  onClick={() => downloadCSV(rows, `${slug}-${startDate}-to-${endDate}.csv`)}
                >
                  Download CSV
                </button>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="state-box">No data found for this period.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {columns.map(col => <th key={col}>{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        {columns.map(col => (
                          <td key={col} className={col === 'SKU' ? 'sku-cell' : ''}>
                            {row[col]}
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
    </>
  )
}
