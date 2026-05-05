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
  return {
    props: {
      slug: params.slug,
      name: report.name,
      description: report.description,
      requiresDates: report.requiresDates,
      supportsTypeFilter: report.supportsTypeFilter || false,
      typeOptions: report.supportsTypeFilter ? Object.keys(TYPE_GROUPS) : [],
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

export default function ReportPage({ slug, name, description, requiresDates, supportsTypeFilter, typeOptions = [] }) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(thirtyDaysAgo)
  const [endDate, setEndDate] = useState(today)
  const [productType, setProductType] = useState('')
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (router.query.start) setStartDate(router.query.start)
    if (router.query.end) setEndDate(router.query.end)
  }, [router.query])


  async function runReport() {
    setLoading(true)
    setError(null)
    setRows(null)
    setProgress({ count: 0 })

    let allRows = []
    let pageInfo = null

    try {
      do {
        const params = new URLSearchParams()
        if (requiresDates) {
          params.set('startDate', startDate)
          params.set('endDate', endDate)
        }
        if (productType) params.set('productType', productType)
        if (pageInfo) params.set('page_info', pageInfo)

        const res = await fetch(`/api/reports/${slug}?${params}`)
        const json = await res.json()

        if (!res.ok) {
          setError(json.error)
          return
        }

        allRows = allRows.concat(json.rows)
        pageInfo = json.nextPageInfo
        setProgress({ count: allRows.length })
      } while (pageInfo)

      setRows(allRows)
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

  const columns = rows?.length ? Object.keys(rows[0]) : []
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
              ? `Fetched ${progress.count.toLocaleString()} records — still going…`
              : 'Connecting to Shopify…'}
          </div>
          {progress?.count > 0 && (
            <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>
              {requiresDates ? 'Large date ranges may take a moment' : 'Fetching all products — this may take a moment'}
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
            <span className="results-count">{rows.length.toLocaleString()} rows</span>
            {rows.length > 0 && (
              <button className="btn btn-secondary" onClick={() => downloadCSV(rows, csvFilename)}>
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
                  <tr>{columns.map(col => <th key={col}>{col}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
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
