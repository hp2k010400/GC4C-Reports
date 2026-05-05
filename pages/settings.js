import { useEffect, useState } from 'react'

export default function Settings() {
  const [historyCount, setHistoryCount] = useState(0)
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem('gc4c_history') || '[]')
      setHistoryCount(h.length)
    } catch {}
  }, [])

  function clearHistory() {
    if (!window.confirm('Clear all history? This only removes local records — it won\'t affect Shopify.')) return
    localStorage.removeItem('gc4c_history')
    setHistoryCount(0)
    setCleared(true)
  }

  return (
    <div className="container">
      <div className="page-title">Settings</div>
      <div className="page-sub">Connection details and preferences for GC4C Reports.</div>

      <div className="settings-section">
        <h3 className="settings-section-title">Store connection</h3>
        <div className="settings-row">
          <div>
            <div className="settings-label">Shopify store</div>
            <div className="settings-value">golfclubs4cash.myshopify.com</div>
          </div>
          <span className="badge-connected">
            <span style={{ width: 7, height: 7, background: '#4ade80', borderRadius: '50%', display: 'inline-block', marginRight: 6 }} />
            Connected
          </span>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">API</div>
            <div className="settings-value">Shopify Admin REST API 2025-04</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Hosted on</div>
            <div className="settings-value">Netlify — auto-deploys from GitHub (hp2k010400/GC4C-Reports)</div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Data</h3>
        <div className="settings-row">
          <div>
            <div className="settings-label">Report history</div>
            <div className="settings-value">
              {cleared ? 'Cleared' : `${historyCount} item${historyCount !== 1 ? 's' : ''} stored in browser (localStorage)`}
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={clearHistory}
            disabled={historyCount === 0 || cleared}
          >
            {cleared ? 'Cleared' : 'Clear history'}
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#aaa', marginTop: 4, lineHeight: 1.5 }}>
          History is stored in your browser only. Clearing it doesn&apos;t affect any Shopify data.
        </p>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">About</h3>
        <div className="settings-row">
          <div>
            <div className="settings-label">Purpose</div>
            <div className="settings-value">Internal reporting tool — replaces Data Export &amp; Ablestar apps</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Data source</div>
            <div className="settings-value">Direct Shopify API — no sync delay, no missing SKUs</div>
          </div>
        </div>
      </div>
    </div>
  )
}
