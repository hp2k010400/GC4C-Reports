import { useState, useEffect, useRef } from 'react'

const DEFAULT_reasons = ['Damaged', 'Found — count correction', 'Missing — count correction', 'Theft', 'Sample / Demo', 'Sent for Repair', 'Returned to Stock', 'Other']

function newLine() {
  return { id: Date.now() + Math.random(), sku: '', product: null, matches: null, qty: '', looking: false, error: null }
}

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

function toCSV(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [headers.join(','), ...rows.map(row => headers.map(h => {
    const v = String(row[h] ?? '')
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
  }).join(','))].join('\n')
}

function downloadCSV(rows, filename) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function AdjustmentsPage() {
  const [lines, setLines]           = useState([newLine()])
  const [locations, setLocations]   = useState([])
  const [locationId, setLocationId] = useState('')
  const [reasons, setReasons]       = useState(DEFAULT_reasons)
  const [reason, setReason]         = useState(DEFAULT_reasons[0])
  const [notes, setNotes]           = useState('')
  const [employee, setEmployee]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState(null)
  const [logMonth, setLogMonth]     = useState(new Date().toISOString().slice(0, 7))
  const [logEntries, setLogEntries] = useState([])
  const [logLoading, setLogLoading] = useState(true)
  const fileRef = useRef()
  const months = monthOptions()

  useEffect(() => {
    fetch('/api/locations').then(r => r.json()).then(d => {
      const locs = d.locations || []
      setLocations(locs)
      if (locs.length) setLocationId(String(locs[0].id))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/reason-codes').then(r => r.json())
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

  function updateLine(id, patch) {
    setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l))
  }

  async function lookupLine(id) {
    const line = lines.find(l => l.id === id)
    if (!line?.sku.trim()) return
    updateLine(id, { looking: true, error: null, product: null, matches: null })
    try {
      const res = await fetch(`/api/sku-lookup?sku=${encodeURIComponent(line.sku.trim())}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      if (data.matches) {
        updateLine(id, { matches: data.matches, looking: false })
      } else {
        updateLine(id, { product: data, looking: false })
      }
    } catch (err) {
      updateLine(id, { error: err.message, looking: false })
    }
  }

  async function selectMatch(lineId, sku) {
    updateLine(lineId, { looking: true, matches: null })
    try {
      const res = await fetch(`/api/sku-lookup?sku=${encodeURIComponent(sku)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      updateLine(lineId, { product: data, sku: data.sku, looking: false })
    } catch (err) {
      updateLine(lineId, { error: err.message, looking: false })
    }
  }

  async function handleCSVImport(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    const text = await file.text()
    const rows = text.trim().split('\n').map(r => r.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
    // Find SKU and Quantity columns (handle header row)
    let startRow = 0
    let skuCol = 0, qtyCol = 1
    if (rows[0][0].toLowerCase() === 'sku' || rows[0][0].toLowerCase() === 'product sku') {
      startRow = 1
      skuCol = rows[0].findIndex(h => h.toLowerCase().includes('sku'))
      qtyCol = rows[0].findIndex(h => h.toLowerCase().includes('qty') || h.toLowerCase().includes('quantity'))
      if (skuCol < 0) skuCol = 0
      if (qtyCol < 0) qtyCol = 1
    }
    const newLines = rows.slice(startRow)
      .filter(r => r[skuCol]?.trim())
      .map(r => ({ ...newLine(), sku: r[skuCol].trim(), qty: r[qtyCol]?.trim() || '' }))
    if (!newLines.length) return
    setLines(newLines)
    setSubmitResult(null)
    // Auto-lookup all
    for (const line of newLines) {
      await lookupLine(line.id)
    }
  }

  async function handleSubmit() {
    const validLines = lines.filter(l => l.product && l.qty && parseInt(l.qty) !== 0 && !isNaN(parseInt(l.qty)))
    if (!validLines.length || !locationId || !employee.trim()) return

    setSubmitting(true)
    setSubmitResult(null)
    try {
      const selectedLoc = locations.find(l => String(l.id) === locationId)
      const items = validLines.map(line => ({
        inventoryItemId: line.product.inventoryItemId,
        locationId: parseInt(locationId),
        adjustment: parseInt(line.qty),
        sku: line.product.sku,
        productTitle: line.product.productTitle,
        variantTitle: line.product.variantTitle || '',
        locationName: selectedLoc?.name || locationId,
      }))

      const res = await fetch('/api/inventory-adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, reason, notes, employee: employee.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Adjustment failed')

      setSubmitResult({ ok: true, count: validLines.length, lines: validLines, locationName: selectedLoc?.name })

      // Refresh log
      const logRes = await fetch(`/api/adjustment-log?month=${logMonth}`)
      const logData = await logRes.json()
      setLogEntries(logData.entries || [])

      // Reset lines
      setLines([newLine()])
      setNotes('')
    } catch (err) {
      setSubmitResult({ error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  function exportApplied() {
    if (!submitResult?.lines) return
    const rows = submitResult.lines.map(l => ({
      SKU: l.product.sku,
      Product: l.product.productTitle + (l.product.variantTitle ? ` — ${l.product.variantTitle}` : ''),
      Location: submitResult.locationName,
      Adjustment: parseInt(l.qty),
      Reason: reason,
      Notes: notes,
      Employee: employee,
    }))
    downloadCSV(rows, `adjustment-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function exportLog() {
    if (!logEntries.length) return
    const rows = logEntries.map(e => ({
      'Date': new Date(e.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }),
      'Employee': e.employee,
      'SKU': e.sku,
      'Product': e.productTitle + (e.variantTitle ? ` — ${e.variantTitle}` : ''),
      'Location': e.locationName,
      'Adjustment': e.adjustment,
      'New Qty': e.newQuantity ?? '',
      'Reason': e.reason,
      'Notes': e.notes,
    }))
    downloadCSV(rows, `adjustment-log-${logMonth}.csv`)
  }

  const validCount = lines.filter(l => l.product && l.qty && parseInt(l.qty) !== 0 && !isNaN(parseInt(l.qty))).length
  const canSubmit = validCount > 0 && locationId && employee.trim() && !submitting

  return (
    <div className="container">
      <div className="page-title">Stock Adjustments</div>
      <div className="page-sub">
        Add one or more SKUs, set a quantity for each, then apply with a shared reason and location. All adjustments sync to Shopify instantly.
      </div>

      {/* Global settings */}
      <div className="adj-card">
        <div className="adj-card-title">Adjustment Settings</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <label className="form-label">Location</label>
            <select className="form-select" value={locationId} onChange={e => setLocationId(e.target.value)}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Reason</label>
            <select className="form-select" value={reason} onChange={e => setReason(e.target.value)}>
              {reasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Employee</label>
            <input className="form-input" type="text" placeholder="Your name" value={employee} onChange={e => setEmployee(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Notes (optional)</label>
            <input className="form-input" type="text" placeholder="Any additional context…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Product lines */}
      <div className="adj-card">
        <div className="adj-card-title">Products to Adjust</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lines.map((line, idx) => {
            const locStock = line.product?.inventory?.find(l => String(l.locationId) === locationId)
            const qty = parseInt(line.qty) || 0
            const newQty = locStock ? locStock.available + qty : null
            return (
              <div key={line.id}>
                {/* SKU input row */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#999', minWidth: 20 }}>{idx + 1}.</span>
                  <input
                    className="form-input"
                    style={{ flex: 1, maxWidth: 280 }}
                    type="text"
                    placeholder="SKU"
                    value={line.sku}
                    onChange={e => updateLine(line.id, { sku: e.target.value, product: null, matches: null, error: null })}
                    onKeyDown={e => e.key === 'Enter' && lookupLine(line.id)}
                  />
                  <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }}
                    onClick={() => lookupLine(line.id)} disabled={line.looking || !line.sku.trim()}>
                    {line.looking ? '…' : 'Look up'}
                  </button>
                  {line.product && (
                    <input
                      className="form-input"
                      type="number"
                      placeholder="+2 or -1"
                      style={{ width: 90 }}
                      value={line.qty}
                      onChange={e => updateLine(line.id, { qty: e.target.value })}
                    />
                  )}
                  {lines.length > 1 && (
                    <button onClick={() => setLines(ls => ls.filter(l => l.id !== line.id))}
                      style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>×</button>
                  )}
                </div>

                {/* Product info */}
                {line.product && (
                  <div style={{ marginTop: 6, marginLeft: 28, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {line.product.productTitle}
                      {line.product.variantTitle ? <span style={{ fontWeight: 400, color: '#666' }}> — {line.product.variantTitle}</span> : ''}
                    </span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#888' }}>{line.product.sku}</span>
                    {locStock !== undefined && (
                      <span style={{ fontSize: 12, color: '#888' }}>
                        Stock: <strong>{locStock?.available ?? 0}</strong>
                        {line.qty && qty !== 0 && newQty !== null && (
                          <span> → <strong style={{ color: newQty < 0 ? '#c0392b' : '#005F2C' }}>{newQty}</strong></span>
                        )}
                      </span>
                    )}
                  </div>
                )}

                {/* Matches picker */}
                {line.matches && (
                  <div style={{ marginTop: 8, marginLeft: 28, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 12, color: '#888' }}>Multiple matches — select one:</div>
                    {line.matches.map(m => (
                      <button key={m.inventoryItemId} onClick={() => selectMatch(line.id, m.sku)}
                        style={{ textAlign: 'left', padding: '8px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 13, maxWidth: 480 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#005F2C', marginRight: 10 }}>{m.sku}</span>
                        <span style={{ fontWeight: 600 }}>{m.productTitle}</span>
                        {m.variantTitle && <span style={{ color: '#888' }}> — {m.variantTitle}</span>}
                      </button>
                    ))}
                  </div>
                )}

                {line.error && (
                  <div style={{ marginTop: 4, marginLeft: 28, color: '#c0392b', fontSize: 13 }}>{line.error}</div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => setLines(ls => [...ls, newLine()])}>+ Add SKU</button>
          <button className="btn btn-secondary" onClick={() => fileRef.current.click()}>Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} />
        </div>
      </div>

      {/* Submit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? 'Applying…' : `Apply ${validCount || ''} Adjustment${validCount !== 1 ? 's' : ''}`}
        </button>
        {submitResult?.ok && (
          <>
            <span style={{ color: '#005F2C', fontWeight: 600, fontSize: 14 }}>
              Done — {submitResult.count} adjustment{submitResult.count !== 1 ? 's' : ''} applied
            </span>
            <button className="btn btn-secondary" onClick={exportApplied}>Download CSV</button>
          </>
        )}
        {submitResult?.error && (
          <span style={{ color: '#c0392b', fontSize: 14 }}>Error: {submitResult.error}</span>
        )}
      </div>

      {/* Adjustment log */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: '#111' }}>Adjustment Log</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {logEntries.length > 0 && (
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={exportLog}>
              Download {monthLabel(logMonth)}
            </button>
          )}
          <select className="form-select" style={{ width: 'auto' }} value={logMonth} onChange={e => setLogMonth(e.target.value)}>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
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
                <th></th>
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
                  <td>{e.productTitle}{e.variantTitle ? <span style={{ color: '#888' }}> — {e.variantTitle}</span> : ''}</td>
                  <td>{e.locationName}</td>
                  <td style={{ fontWeight: 700, color: e.adjustment > 0 ? '#005F2C' : '#c0392b', textAlign: 'center' }}>
                    {e.adjustment > 0 ? `+${e.adjustment}` : e.adjustment}
                  </td>
                  <td style={{ textAlign: 'center' }}>{e.newQuantity ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{e.reason}</td>
                  <td style={{ fontSize: 12, color: '#888' }}>{e.notes}</td>
                  <td>
                    <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px', whiteSpace: 'nowrap' }}
                      onClick={() => downloadCSV([{
                        'Date': new Date(e.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }),
                        'Employee': e.employee, 'SKU': e.sku,
                        'Product': e.productTitle + (e.variantTitle ? ` — ${e.variantTitle}` : ''),
                        'Location': e.locationName, 'Adjustment': e.adjustment,
                        'New Qty': e.newQuantity ?? '', 'Reason': e.reason, 'Notes': e.notes,
                      }], `adjustment-${e.sku}-${e.timestamp.slice(0,10)}.csv`)}>
                      CSV
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
