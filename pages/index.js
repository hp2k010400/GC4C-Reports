import { useEffect, useState } from 'react'
import Link from 'next/link'
import { reports } from '../lib/reports/index.js'

const ICONS = {
  'sales-by-sku': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
    </svg>
  ),
  'inventory-on-hand': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  'product-export': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  'bulk-update': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  ),
}

const ARROW = (
  <svg className="report-card-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function Dashboard() {
  const [history, setHistory] = useState([])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const shop = params.get('shop')
    const hmac = params.get('hmac')
    if (shop && hmac && !process.env.NEXT_PUBLIC_TOKEN_SET) {
      window.location.href = '/api/auth?shop=' + shop
    }
    try {
      setHistory(JSON.parse(localStorage.getItem('gc4c_history') || '[]'))
    } catch {}
  }, [])

  const reportRuns = history.filter(h => !h.type || h.type === 'report')
  const bulkEdits = history.filter(h => h.type === 'bulk-edit')
  const totalRows = reportRuns.reduce((s, h) => s + (h.rowCount || 0), 0)
  const totalUpdated = bulkEdits.reduce((s, h) => s + (h.updated || 0), 0)

  return (
    <div className="container">
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{reportRuns.length}</div>
          <div className="stat-label">Report runs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalRows.toLocaleString()}</div>
          <div className="stat-label">Rows fetched</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{bulkEdits.length}</div>
          <div className="stat-label">Bulk edits</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalUpdated.toLocaleString()}</div>
          <div className="stat-label">Products updated</div>
        </div>
      </div>

      <div className="quick-actions">
        <Link href="/reports/sales-by-sku" className="quick-action">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
          </svg>
          Run a report
        </Link>
        <Link href="/reports/product-export" className="quick-action">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export products
        </Link>
        <Link href="/bulk-update" className="quick-action">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
          </svg>
          Bulk edit products
        </Link>
      </div>

      <div className="section-label" style={{ marginBottom: 14 }}>Available reports</div>

      <div className="report-grid">
        {Object.entries(reports).map(([slug, report]) => (
          <Link key={slug} href={`/reports/${slug}`} className="report-card">
            <div className="report-card-icon">{ICONS[slug]}</div>
            <div className="report-card-name">{report.name}</div>
            <div className="report-card-desc">{report.description}</div>
            <div className="report-card-footer">
              <span className="report-card-tag">{report.requiresDates ? 'Date range' : 'Live snapshot'}</span>
              {ARROW}
            </div>
          </Link>
        ))}
        <Link href="/bulk-update" className="report-card">
          <div className="report-card-icon">{ICONS['bulk-update']}</div>
          <div className="report-card-name">Bulk Product Update</div>
          <div className="report-card-desc">Upload an edited Product Export CSV to update prices, SKUs, compare-at prices and more across your entire catalogue in one go.</div>
          <div className="report-card-footer">
            <span className="report-card-tag">Upload CSV</span>
            {ARROW}
          </div>
        </Link>
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="section-label">Recent activity</div>
            <Link href="/history" style={{ fontSize: 12, color: '#005F2C', fontWeight: 600, textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          <div className="history-list">
            {history.slice(0, 5).map((h, i) => (
              <div key={i} className="history-item">
                <span className={`history-type-badge ${h.type === 'bulk-edit' ? 'badge-bulk' : 'badge-report'}`}>
                  {h.type === 'bulk-edit' ? 'Bulk Edit' : 'Report'}
                </span>
                <span className="history-name">{h.name}</span>
                {h.startDate && (
                  <span className="history-dates">{h.startDate} → {h.endDate}</span>
                )}
                <span className="history-count">
                  {h.type === 'bulk-edit'
                    ? `${(h.updated || 0).toLocaleString()} updated`
                    : `${(h.rowCount || 0).toLocaleString()} rows`}
                </span>
                <span className="history-ts">{timeAgo(h.ts)}</span>
                {h.slug && (
                  <Link
                    href={`/reports/${h.slug}?autorun=1${h.startDate ? `&start=${h.startDate}&end=${h.endDate}` : ''}`}
                    className="history-rerun"
                    onClick={e => e.stopPropagation()}
                  >
                    Re-run →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
