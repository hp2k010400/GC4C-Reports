import { useEffect, useState } from 'react'

const SHOPIFY_CODES = [
  { value: 'correction',     label: 'Correction' },
  { value: 'damaged',        label: 'Damaged' },
  { value: 'theft_or_loss',  label: 'Theft or Loss' },
  { value: 'promotion',      label: 'Promotion / Sample' },
  { value: 'quality_control',label: 'Quality Control' },
  { value: 'received',       label: 'Received' },
  { value: 'other',          label: 'Other' },
]

export default function Settings() {
  const [historyCount, setHistoryCount] = useState(0)
  const [cleared, setCleared] = useState(false)
  const [reasonCodes, setReasonCodes] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const [newShopifyCode, setNewShopifyCode] = useState('correction')
  const [reasonSaving, setReasonSaving] = useState(false)
  const [reasonError, setReasonError] = useState(null)

  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem('gc4c_history') || '[]')
      setHistoryCount(h.length)
    } catch {}
  }, [])

  useEffect(() => {
    fetch('/api/reason-codes').then(r => r.json()).then(d => setReasonCodes(d.codes || [])).catch(() => {})
  }, [])

  async function addReason() {
    if (!newLabel.trim()) return
    setReasonSaving(true)
    setReasonError(null)
    try {
      const res = await fetch('/api/reason-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim(), shopifyCode: newShopifyCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReasonCodes(data.codes)
      setNewLabel('')
    } catch (err) {
      setReasonError(err.message)
    } finally {
      setReasonSaving(false)
    }
  }

  async function deleteReason(label) {
    const res = await fetch(`/api/reason-codes?label=${encodeURIComponent(label)}`, { method: 'DELETE' })
    if (res.ok) setReasonCodes(c => c.filter(r => r.label !== label))
  }

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
        <h3 className="settings-section-title">Adjustment Reason Codes</h3>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
          These appear in the Stock Adjustments reason dropdown and sync to Shopify with the mapped code.
        </p>
        {reasonCodes.map(c => (
          <div key={c.label} className="settings-row">
            <div>
              <div className="settings-label">{c.label}</div>
              <div className="settings-value" style={{ fontSize: 12, color: '#aaa' }}>
                Shopify: {SHOPIFY_CODES.find(s => s.value === c.shopifyCode)?.label || c.shopifyCode}
              </div>
            </div>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => deleteReason(c.label)}>
              Delete
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="New reason label…"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addReason()}
          />
          <select className="form-select" style={{ width: 'auto' }} value={newShopifyCode} onChange={e => setNewShopifyCode(e.target.value)}>
            {SHOPIFY_CODES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={addReason} disabled={reasonSaving || !newLabel.trim()}>
            {reasonSaving ? 'Adding…' : 'Add'}
          </button>
        </div>
        {reasonError && <div style={{ color: '#c0392b', fontSize: 13, marginTop: 8 }}>{reasonError}</div>}
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
