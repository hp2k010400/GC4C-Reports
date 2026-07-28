import { useEffect, useState } from 'react'

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
  // No persistence (no cookie/localStorage) — password required every time
  // this page is opened, same pattern as the Stock Adjustments gate.
  const [unlocked, setUnlocked] = useState(false)
  const [gatePassword, setGatePassword] = useState('')
  const [gateChecking, setGateChecking] = useState(false)
  const [gateError, setGateError] = useState(null)

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

  const [stockyCount, setStockyCount] = useState(null)
  const [stockyUpdatedAt, setStockyUpdatedAt] = useState(null)
  const [stockyFileName, setStockyFileName] = useState(null)
  const [stockyRows, setStockyRows] = useState(null)
  const [stockyUploading, setStockyUploading] = useState(false)
  const [stockyError, setStockyError] = useState(null)
  const [stockyResult, setStockyResult] = useState(null)

  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem('gc4c_history') || '[]')
      setHistoryCount(h.length)
    } catch {}
  }, [])

  useEffect(() => {
    fetch('/api/reason-codes').then(r => r.json()).then(d => setReasonCodes(d.codes || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!unlocked) return
    fetch('/api/stocky-log').then(r => r.json()).then(d => {
      setStockyCount(d.rows?.length || 0)
      setStockyUpdatedAt(d.updatedAt)
    }).catch(() => {})
  }, [unlocked])

  function handleStockyFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setStockyFileName(file.name)
    setStockyResult(null)
    setStockyError(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        setStockyRows(parseCSV(ev.target.result))
      } catch {
        setStockyError('Could not parse CSV')
      }
    }
    reader.readAsText(file)
  }

  async function uploadStocky() {
    if (!stockyRows?.length) return
    setStockyUploading(true)
    setStockyError(null)
    try {
      const res = await fetch('/api/stocky-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: gatePassword, rows: stockyRows }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStockyResult(`Uploaded ${data.count} rows`)
      setStockyCount(data.count)
      setStockyUpdatedAt(new Date().toISOString())
      setStockyRows(null)
      setStockyFileName(null)
    } catch (err) {
      setStockyError(err.message)
    } finally {
      setStockyUploading(false)
    }
  }

  async function addReason() {
    if (!newLabel.trim()) return
    setReasonSaving(true)
    setReasonError(null)
    try {
      const res = await fetch('/api/reason-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim(), shopifyCode: newShopifyCode, password: gatePassword }),
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
    const res = await fetch(`/api/reason-codes?label=${encodeURIComponent(label)}&password=${encodeURIComponent(gatePassword)}`, { method: 'DELETE' })
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
        body: JSON.stringify({ originalLabel: editingLabel, label: editLabel.trim(), shopifyCode: editShopifyCode, password: gatePassword }),
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

  function clearHistory() {
    if (!window.confirm('Clear all history? This only removes local records — it won\'t affect Shopify.')) return
    localStorage.removeItem('gc4c_history')
    setHistoryCount(0)
    setCleared(true)
  }

  async function handleUnlock(e) {
    e.preventDefault()
    if (!gatePassword) return
    setGateChecking(true)
    setGateError(null)
    try {
      const res = await fetch('/api/settings-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: gatePassword }),
      })
      if (!res.ok) throw new Error('Incorrect password')
      setUnlocked(true)
    } catch (err) {
      setGateError(err.message)
    } finally {
      setGateChecking(false)
    }
  }

  if (!unlocked) {
    return (
      <div className="container" style={{ maxWidth: 380 }}>
        <div className="page-title">Settings</div>
        <div className="page-sub">This section is restricted. Enter the password to continue.</div>
        <form onSubmit={handleUnlock} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="form-input"
            type="password"
            placeholder="Password"
            value={gatePassword}
            onChange={e => setGatePassword(e.target.value)}
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={gateChecking || !gatePassword}>
            {gateChecking ? 'Checking…' : 'Continue'}
          </button>
          {gateError && <div className="state-box error">{gateError}</div>}
        </form>
      </div>
    )
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
        {[...reasonCodes].sort((a, b) => a.label.localeCompare(b.label)).map(c => (
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
            <div key={c.label} className="settings-row">
              <div>
                <div className="settings-label">{c.label}</div>
                <div className="settings-value" style={{ fontSize: 12, color: '#aaa' }}>
                  Shopify: {SHOPIFY_CODES.find(s => s.value === c.shopifyCode)?.label || c.shopifyCode}
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

      <div className="settings-section">
        <h3 className="settings-section-title">Stocky Historical Adjustments</h3>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
          Powers the search box at the top of Stock Adjustments. Export Neil&apos;s spreadsheet as CSV and upload
          it here each time it&apos;s updated — this replaces the whole searchable log with the new file.
        </p>
        <div className="settings-row">
          <div>
            <div className="settings-label">Current log</div>
            <div className="settings-value">
              {stockyCount === null ? '…' : `${stockyCount.toLocaleString()} rows`}
              {stockyUpdatedAt && ` — last updated ${new Date(stockyUpdatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="file" accept=".csv" onChange={handleStockyFile} />
          <button className="btn btn-primary" onClick={uploadStocky} disabled={!stockyRows?.length || stockyUploading}>
            {stockyUploading ? 'Uploading…' : `Upload${stockyFileName ? ` ${stockyFileName}` : ''}`}
          </button>
        </div>
        {stockyResult && <div style={{ color: '#005F2C', fontSize: 13, marginTop: 8 }}>{stockyResult}</div>}
        {stockyError && <div style={{ color: '#c0392b', fontSize: 13, marginTop: 8 }}>{stockyError}</div>}
      </div>
    </div>
  )
}
