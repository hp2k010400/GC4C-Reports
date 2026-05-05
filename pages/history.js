import { useEffect, useState } from 'react'
import Link from 'next/link'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'report', label: 'Reports' },
  { key: 'bulk-edit', label: 'Bulk Edits' },
]

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatDate(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function History() {
  const [history, setHistory] = useState([])
  const [tab, setTab] = useState('all')
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem('gc4c_history') || '[]'))
    } catch {}
  }, [])

  function clearHistory() {
    if (!window.confirm('Clear all history? This only removes local records — it won\'t affect Shopify.')) return
    localStorage.removeItem('gc4c_history')
    setHistory([])
    setCleared(true)
  }

  const filtered = history.filter(h => {
    if (tab === 'all') return true
    const type = h.type || 'report'
    return type === tab
  })

  const counts = {
    all: history.length,
    report: history.filter(h => !h.type || h.type === 'report').length,
    'bulk-edit': history.filter(h => h.type === 'bulk-edit').length,
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <div className="page-title">History</div>
          <div className="page-sub">All report runs, exports, and bulk edits — stored in your browser.</div>
        </div>
        {history.length > 0 && (
          <button className="btn btn-secondary" onClick={clearHistory}>
            Clear all
          </button>
        )}
      </div>

      <div className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tab-btn${tab === t.key ? ' tab-btn-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className="tab-count">{counts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="state-box">
          {cleared
            ? 'History cleared.'
            : history.length === 0
            ? 'No history yet — run a report or bulk edit to see activity here.'
            : 'No items match this filter.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.map((h, i) => {
            const type = h.type || 'report'
            const isBulk = type === 'bulk-edit'
            const href = isBulk
              ? '/bulk-update'
              : `/reports/${h.slug}${h.startDate ? `?start=${h.startDate}&end=${h.endDate}` : ''}`
            return (
              <Link key={i} href={href} className="history-item-full">
                <span className={`history-type-badge ${isBulk ? 'badge-bulk' : 'badge-report'}`}>
                  {isBulk ? 'Bulk Edit' : 'Report'}
                </span>
                <div className="history-item-body">
                  <span className="history-name">{h.name}</span>
                  {h.startDate && (
                    <span className="history-dates">{h.startDate} → {h.endDate}</span>
                  )}
                </div>
                <div className="history-item-meta">
                  <span className="history-count">
                    {isBulk
                      ? `${(h.updated || 0).toLocaleString()} updated${h.skipped ? `, ${h.skipped} skipped` : ''}`
                      : `${(h.rowCount || 0).toLocaleString()} rows`}
                  </span>
                  <span className="history-ts" title={formatDate(h.ts)}>{timeAgo(h.ts)}</span>
                </div>
                <span className="history-rerun">Open →</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
