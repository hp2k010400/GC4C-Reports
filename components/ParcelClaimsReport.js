import { useState, useEffect, useCallback } from 'react'
import { fmtGbp } from '../lib/parcelClaims'

function fmtPeriod(period, granularity) {
  if (granularity === 'month') {
    const [y, m] = period.split('-')
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' })
  }
  if (granularity === 'week') {
    const start = new Date(period)
    return start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
  }
  const [y, m, d] = period.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const HEAD_BG = '#dce6f1' // light blue, matches the old sheet's pivot table header shade
const TOTAL_BG = '#dce6f1'

// Cost heatmap — the higher a month's cost relative to the priciest month in
// view, the deeper the red, so expensive periods jump out at a glance.
function costHeat(value, max) {
  if (!max || !value) return undefined
  const ratio = Math.min(value / max, 1)
  return `rgba(220, 38, 38, ${(0.08 + ratio * 0.34).toFixed(2)})`
}

const HV_BG = '#fdecea' // pale red/amber — higher-value, higher-risk claims
const LV_BG = '#eafaf0' // pale green — lower-value claims

// Light brand-ish tints per courier so the columns are easy to tell apart at
// a glance rather than a wall of identical numbers.
const COURIER_BG = {
  DPD: '#fde8e8',
  FedEx: '#f3effc',
  UPS: '#fdf3e3',
  'Royal Mail': '#fde8ee',
  Evri: '#ecebfa',
  Other: '#f0f2f5',
  '(blank)': '#f5f5f5',
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ParcelClaimsReport() {
  const [granularity, setGranularity] = useState('month')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/parcel-claims/report?granularity=${granularity}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load report')
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [granularity])

  useEffect(() => { load() }, [load])

  function exportCSV() {
    if (!data) return
    const headers = ['Period', 'Retail', 'Cost', 'Claim Amount', 'HV', 'LV', ...data.couriers]
    const lines = [headers, ...data.rows.map(r => [
      fmtPeriod(r.period, data.granularity), r.retail.toFixed(2), r.cost.toFixed(2), r.claimAmount.toFixed(2),
      r.hv, r.lv, ...data.couriers.map(c => r.byCourier[c] || 0),
    ])]
    downloadCSV(lines.map(l => l.join(',')).join('\n'), `missing-parcels-report-${granularity}.csv`)
  }

  const gLabel = granularity[0].toUpperCase() + granularity.slice(1)

  return (
    <div>
      <div className="filter-builder" style={{ marginBottom: 16 }}>
        <div className="filter-builder-header">
          <div className="chip-bar">
            {['day', 'week', 'month'].map(g => (
              <button key={g} className={`chip-btn${granularity === g ? ' active' : ''}`} onClick={() => setGranularity(g)}>
                {g[0].toUpperCase() + g.slice(1)}ly
              </button>
            ))}
          </div>
          {data && (
            <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={exportCSV}>
              Download CSV
            </button>
          )}
        </div>
      </div>

      {loading && <div className="state-box"><div className="spinner" />Loading report…</div>}
      {error && <div className="state-box error">Error: {error}</div>}

      {data && !loading && (() => {
        const maxCost = Math.max(0, ...data.rows.map(r => r.cost))
        return (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8 }}>
          {/* --- Cost Summary --- */}
          <div className="chart-card" style={{ flex: '1 1 0', minWidth: 260, margin: 0 }}>
            <div className="chart-card-title">{gLabel}ly Cost Summary</div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="table-compact" style={{ width: '100%' }}>
                <thead>
                  <tr style={{ background: HEAD_BG }}>
                    <th>{gLabel}</th>
                    <th style={{ textAlign: 'right' }}>Sum of Retail</th>
                    <th style={{ textAlign: 'right' }}>Sum of Cost</th>
                    <th style={{ textAlign: 'right' }}>Sum of Claim</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.period}>
                      <td>{fmtPeriod(r.period, data.granularity)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtGbp(r.retail)}</td>
                      <td style={{ textAlign: 'right', background: costHeat(r.cost, maxCost) }}>{fmtGbp(r.cost)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtGbp(r.claimAmount)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, background: TOTAL_BG }}>
                    <td>Grand Total</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(data.grand.retail)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(data.grand.cost)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(data.grand.claimAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- HV/LV Summary --- */}
          <div className="chart-card" style={{ flex: '1 1 0', minWidth: 220, margin: 0 }}>
            <div className="chart-card-title">{gLabel}ly HV/LV Summary</div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="table-compact" style={{ width: '100%' }}>
                <thead>
                  <tr style={{ background: HEAD_BG }}>
                    <th>{gLabel}</th>
                    <th style={{ textAlign: 'right', background: HV_BG }}>HV</th>
                    <th style={{ textAlign: 'right', background: LV_BG }}>LV</th>
                    <th style={{ textAlign: 'right', background: HV_BG }}>HV %</th>
                    <th style={{ textAlign: 'right', background: LV_BG }}>LV %</th>
                    <th style={{ textAlign: 'right' }}>Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => {
                    const tagged = r.hv + r.lv
                    return (
                      <tr key={r.period}>
                        <td>{fmtPeriod(r.period, data.granularity)}</td>
                        <td style={{ textAlign: 'right', background: HV_BG }}>{r.hv || ''}</td>
                        <td style={{ textAlign: 'right', background: LV_BG }}>{r.lv || ''}</td>
                        <td style={{ textAlign: 'right', background: HV_BG }}>{tagged ? `${Math.round((r.hv / tagged) * 100)}%` : ''}</td>
                        <td style={{ textAlign: 'right', background: LV_BG }}>{tagged ? `${Math.round((r.lv / tagged) * 100)}%` : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tagged}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ fontWeight: 700, background: TOTAL_BG }}>
                    <td>Grand Total</td>
                    <td style={{ textAlign: 'right' }}>{data.grand.hv}</td>
                    <td style={{ textAlign: 'right' }}>{data.grand.lv}</td>
                    <td style={{ textAlign: 'right' }}>{data.grand.hv + data.grand.lv ? `${Math.round((data.grand.hv / (data.grand.hv + data.grand.lv)) * 100)}%` : ''}</td>
                    <td style={{ textAlign: 'right' }}>{data.grand.hv + data.grand.lv ? `${Math.round((data.grand.lv / (data.grand.hv + data.grand.lv)) * 100)}%` : ''}</td>
                    <td style={{ textAlign: 'right' }}>{data.grand.hv + data.grand.lv}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Courier Summary --- */}
          <div className="chart-card" style={{ flex: '1 1 0', minWidth: 300, margin: 0 }}>
            <div className="chart-card-title">{gLabel}ly Courier Summary</div>
            <div style={{ maxHeight: 420, overflowY: 'auto', overflowX: 'auto' }}>
              <table className="table-compact" style={{ width: '100%' }}>
                <thead>
                  <tr style={{ background: HEAD_BG }}>
                    <th>{gLabel}</th>
                    {data.couriers.map(c => <th key={c} style={{ textAlign: 'right', background: COURIER_BG[c] }}>{c}</th>)}
                    <th style={{ textAlign: 'right' }}>Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.period}>
                      <td>{fmtPeriod(r.period, data.granularity)}</td>
                      {data.couriers.map(c => <td key={c} style={{ textAlign: 'right', background: COURIER_BG[c] }}>{r.byCourier[c] || ''}</td>)}
                      <td style={{ textAlign: 'right' }}>{r.count}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, background: TOTAL_BG }}>
                    <td>Grand Total</td>
                    {data.couriers.map(c => <td key={c} style={{ textAlign: 'right' }}>{data.grand.byCourier[c] || 0}</td>)}
                    <td style={{ textAlign: 'right' }}>{data.grand.count}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
