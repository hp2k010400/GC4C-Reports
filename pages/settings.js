import { useEffect, useState } from 'react'

const SHOPIFY_CODES = [
  { value: 'correction',     label: 'Correction' },
  { value: 'damaged',        label: 'Damaged' },
  { value: 'shrinkage',      label: 'Theft or Loss' },
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
  const [editingLabel, setEditingLabel] = useState(null)
  const [editLabel, setEditLabel] = useState('')
  const [editShopifyCode, setEditShopifyCode] = useState('correction')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)
  const [dragIndex, setDragIndex] = useState(null)

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

  function startEdit(c) {
    setEditingLabel(c.label)
    setEditLabel(c.label)
    setEditShopifyCode(c.shopifyCode)
    setEditError(null)
  }

  function cancelEdit() {
    setEditingLabel(null)
    setEditError(null)
  }

  async function saveEdit() {
    if (!editLabel.trim()) return
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch('/api/reason-codes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalLabel: editingLabel, label: editLabel.trim(), shopifyCode: editShopifyCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReasonCodes(data.codes)
      setEditingLabel(null)
    } catch (err) {
      setEditError(err.message)
    } finally {
      setEditSaving(false)
    }
  }

  async function persistOrder(codes) {
    try {
      await fetch('/api/reason-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: codes.map(c => c.label) }),
      })
    } catch {}
  }

  function handleDrop(dropIndex) {
    if (dragIndex === null || dragIndex === dropIndex) { setDragIndex(null); return }
    setReasonCodes(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(dropIndex, 0, moved)
      persistOrder(next)
      return next
    })
    setDragIndex(null)
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
            <div className="settings-value">Netlify — auto-deploys from GitHub</div>
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
        {reasonCodes.map((c, i) => (
          editingLabel === c.label ? (
            <div key={c.label} className="settings-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <input
                className="form-input"
                style={{ flex: 1, minWidth: 180 }}
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
              />
              <select className="form-select" style={{ width: 'auto' }} value={editShopifyCode} onChange={e => setEditShopifyCode(e.target.value)}>
                {SHOPIFY_CODES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveEdit} disabled={editSaving || !editLabel.trim()}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={cancelEdit} disabled={editSaving}>
                Cancel
              </button>
              {editError && <div style={{ color: '#c0392b', fontSize: 13, flexBasis: '100%' }}>{editError}</div>}
            </div>
          ) : (
            <div
              key={c.label}
              className="settings-row"
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              style={{ opacity: dragIndex === i ? 0.4 : 1 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => setDragIndex(null)}
                  title="Drag to reorder"
                  style={{ cursor: 'grab', color: '#bbb', display: 'flex', touchAction: 'none' }}
                >
                  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                    <circle cx="2.5" cy="2" r="1.5" />
                    <circle cx="7.5" cy="2" r="1.5" />
                    <circle cx="2.5" cy="8" r="1.5" />
                    <circle cx="7.5" cy="8" r="1.5" />
                    <circle cx="2.5" cy="14" r="1.5" />
                    <circle cx="7.5" cy="14" r="1.5" />
                  </svg>
                </span>
                <div>
                  <div className="settings-label">{c.label}</div>
                  <div className="settings-value" style={{ fontSize: 12, color: '#aaa' }}>
                    Shopify: {SHOPIFY_CODES.find(s => s.value === c.shopifyCode)?.label || c.shopifyCode}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => startEdit(c)}>
                  Edit
                </button>
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => deleteReason(c.label)}>
                  Delete
                </button>
              </div>
            </div>
          )
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
    </div>
  )
}
