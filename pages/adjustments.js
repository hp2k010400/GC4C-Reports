import { useState, useEffect } from 'react'

const DEFAULT_reasons = ['Damaged', 'Found — count correction', 'Missing — count correction', 'Theft', 'Sample / Demo', 'Sent for Repair', 'Returned to Stock', 'Other']

function monthLabel(yyyyMM) {
  const [y, m] = yyyyMM.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    return d.toISOString().slice(0, 7)
  })
}

export default function AdjustmentsPage() {
  const [skuInput, setSkuInput]       = useState('')
  const [looking, setLooking]         = useState(false)
  const [lookupError, setLookupError] = useState(null)
  const [product, setProduct]         = useState(null)

  const [reasons, setReasons]         = useState(DEFAULT_reasons)
  const [locationId, setLocationId]   = useState('')
  const [adjustment, setAdjustment]   = useState('')
  const [reason, setReason]           = useState(DEFAULT_reasons[0])
  const [notes, setNotes]             = useState('')
  const [employee, setEmployee]       = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [submitResult, setSubmitResult] = useState(null)
  const [logMonth, setLogMonth]       = useState(new Date().toISOString().slice(0, 7))
  const [logEntries, setLogEntries]   = useState([])
  const [logLoading, setLogLoading]   = useState(true)

  useEffect(() => {
    fetch('/api/reason-codes')
      .then(r => r.json())
      .then(d => { if (d.codes?.length) setReasons(d.codes.map(c => c.label)) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLogLoading(true)
    fetch(`/api/adjustment-log?month=${logMonth}`)
      .then(r => r.json())
      .then(d => setLogEntries(d.entries || []))
      .catch(() => setLogEntries([]))
      .finally(() => setLogLoading(false))
  }, [logMonth])

  async function handleLookup() {
    if (!skuInput.trim()) return
    setLooking(true)
    setLookupError(null)
    setProduct(null)
    setSubmitResult(null)
    setAdjustment('')
    setNotes('')
    setReason(reasons[0])
    try {
      const res = await fetch(`/api/sku-lookup?sku=${encodeURIComponent(skuInput.trim())}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      setProduct(data)
      const firstWithStock = data.inventory.find(l => l.available > 0)
      setLocationId(String((firstWithStock || data.inventory[0])?.locationId || ''))
    } catch (err) {
      setLookupError(err.message)
    } finally {
      setLooking(false)
    }
  }

  async function handleSubmit() {
    if (!product || !locationId || !adjustment || !employee.trim()) return
    const adj = parseInt(adjustment)
    if (isNaN(adj) || adj === 0) return

    setSubmitting(true)
    setSubmitResult(null)
    try {
      const selectedLoc = product.inventory.find(l => String(l.locationId) === locationId)
      const res = await fetch('/api/inventory-adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryItemId: product.inventoryItemId,
          locationId: parseInt(locationId),
          adjustment: adj,
          sku: product.sku,
          productTitle: product.productTitle,
          variantTitle: product.variantTitle,
          locationName: selectedLoc?.locationName || locationId,
          reason, notes, employee: employee.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Adjustment failed')

      setSubmitResult({ ok: true, newQuantity: data.newQuantity })
      setProduct(prev => ({
        ...prev,
        inventory: prev.inventory.map(l =>
          String(l.locationId) === locationId
            ? { ...l, available: data.newQuantity }
            : l
        ),
      }))
      setAdjustment('')
      setNotes('')

      const logRes = await fetch(`/api/adjustment-log?month=${logMonth}`)
      const logData = await logRes.json()
      setLogEntries(logData.entries || [])
    } catch (err) {
      setSubmitResult({ error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const selectedLoc = product?.inventory.find(l => String(l.locationId) === locationId)
  const currentQty  = selectedLoc?.available ?? null
  const adjNum      = parseInt(adjustment) || 0
  const newQty      = currentQty !== null ? currentQty + adjNum : null
  const months      = monthOptions()

  const canSubmit = product && locationId && adjustment && !isNaN(parseInt(adjustment)) && parseInt(adjustment) !== 0 && employee.trim() && !submitting

  return (
    <div className="container">
      <div className="page-title">Stock Adjustments</div>
      <div className="page-sub">
        Look up a product by SKU, adjust its inventory at a specific location, and log the reason. All adjustments sync to Shopify instantly.
      </div>

      {/* SKU search */}
      <div className="adj-card">
        <div className="adj-card-title">Look up product by SKU</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            style={{ flex: 1, maxWidth: 320 }}
            type="text"
            placeholder="e.g. COBRA-DRV-001"
            value={skuInput}
            onChange={e => setSkuInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
          />
          <button className="btn btn-primary" onClick={handleLookup} disabled={looking || !skuInput.trim()}>
            {looking ? 'Looking up…' : 'Look up'}
          </button>
        </div>
        {lookupError && (
          <div style={{ color: '#c0392b', marginTop: 10, fontSize: 14 }}>
            {lookupError}
          </div>
        )}
      </div>

      {/* Product info + adjustment form */}
      {product && (
        <div className="adj-card">
          <div className="adj-card-title">
            {product.productTitle}
            {product.variantTitle ? <span style={{ fontWeight: 400, color: '#666' }}> — {product.variantTitle}</span> : ''}
          </div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 20, fontFamily: 'monospace' }}>
            SKU: {product.sku}
          </div>

          {/* Location stock chips */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', marginBottom: 10 }}>
              Current stock by location — click to select
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {product.inventory.map(loc => {
                const active = String(loc.locationId) === locationId
                return (
                  <button
                    key={loc.locationId}
                    onClick={() => { setLocationId(String(loc.locationId)); setSubmitResult(null) }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: `2px solid ${active ? '#005F2C' : '#e0e0e0'}`,
                      background: active ? '#f0f7f3' : 'white',
                      cursor: 'pointer',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#222' }}>{loc.locationName}</span>
                    <span style={{
                      fontWeight: 700,
                      color: loc.available > 0 ? '#005F2C' : '#aaa',
                      background: loc.available > 0 ? '#eaf6f0' : '#f5f5f5',
                      padding: '1px 7px',
                      borderRadius: 12,
                      fontSize: 12,
                    }}>
                      {loc.available}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Form */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 560 }}>
            <div>
              <label className="form-label">Location</label>
              <select
                className="form-select"
                value={locationId}
                onChange={e => { setLocationId(e.target.value); setSubmitResult(null) }}
              >
                {product.inventory.map(loc => (
                  <option key={loc.locationId} value={loc.locationId}>
                    {loc.locationName} (stock: {loc.available})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Adjustment</label>
              <input
                className="form-input"
                type="number"
                placeholder="+2 or -1"
                value={adjustment}
                onChange={e => { setAdjustment(e.target.value); setSubmitResult(null) }}
              />
              {adjustment && currentQty !== null && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
                  {currentQty} → <strong style={{ color: newQty < 0 ? '#c0392b' : '#005F2C' }}>{newQty}</strong>
                </div>
              )}
            </div>

            <div>
              <label className="form-label">Reason</label>
              <select className="form-select" value={reason} onChange={e => setReason(e.target.value)}>
                {reasons.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Employee</label>
              <input
                className="form-input"
                type="text"
                placeholder="Your name"
                value={employee}
                onChange={e => setEmployee(e.target.value)}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Notes (optional)</label>
              <input
                className="form-input"
                type="text"
                placeholder="Any additional context…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? 'Applying…' : 'Apply Adjustment'}
            </button>
            {submitResult?.ok && (
              <span style={{ color: '#005F2C', fontWeight: 600, fontSize: 14 }}>
                Done — new quantity: {submitResult.newQuantity}
              </span>
            )}
            {submitResult?.error && (
              <span style={{ color: '#c0392b', fontSize: 14 }}>Error: {submitResult.error}</span>
            )}
          </div>
        </div>
      )}

      {/* Adjustment log */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: '#111' }}>Adjustment Log</div>
        <select
          className="form-select"
          style={{ width: 'auto' }}
          value={logMonth}
          onChange={e => setLogMonth(e.target.value)}
        >
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {logLoading ? (
        <div className="state-box"><div className="spinner" /></div>
      ) : logEntries.length === 0 ? (
        <div className="state-box">No adjustments recorded for {monthLabel(logMonth)}.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Employee</th>
                <th>SKU</th>
                <th>Product</th>
                <th>Location</th>
                <th>Adj</th>
                <th>New Qty</th>
                <th>Reason</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {logEntries.map(e => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    {new Date(e.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td style={{ fontWeight: 500 }}>{e.employee}</td>
                  <td className="sku-cell">{e.sku}</td>
                  <td>
                    {e.productTitle}
                    {e.variantTitle ? <span style={{ color: '#888' }}> — {e.variantTitle}</span> : ''}
                  </td>
                  <td>{e.locationName}</td>
                  <td style={{ fontWeight: 700, color: e.adjustment > 0 ? '#005F2C' : '#c0392b', textAlign: 'center' }}>
                    {e.adjustment > 0 ? `+${e.adjustment}` : e.adjustment}
                  </td>
                  <td style={{ textAlign: 'center' }}>{e.newQuantity ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{e.reason}</td>
                  <td style={{ fontSize: 12, color: '#888' }}>{e.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
