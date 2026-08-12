import { useState, useEffect, useCallback } from 'react'
import { STAGES, CLAIM_STATUSES, stageLabel, claimStatusLabel, fmtGbp } from '../lib/parcelClaims'

function fmtPeriod(period, granularity) {
  if (granularity === 'month') {
    const [y, m] = period.split('-')
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-GB', { month: 'short', year: 'numeric' })
  }
  if (granularity === 'week') {
    const start = new Date(period)
    const end = new Date(start.getTime() + 6 * 86400000)
    const f = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return `${f(start)} – ${f(end)}`
  }
  const [y, m, d] = period.split('-')
  return `${d}/${m}/${y}`
}

function pct(n, total) {
  if (!total) return '—'
  return `${Math.round((n / total) * 100)}%`
}

function downloadCSV(rows, filename) {
  const blob = new Blob([rows], { type: 'text/csv' })
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
    const headers = ['Period', 'Retail', 'Cost', 'Claim Amount', 'Count', 'HV', 'LV', ...data.couriers]
    const lines = [headers, ...data.rows.map(r => [
      fmtPeriod(r.period, data.granularity), r.retail.toFixed(2), r.cost.toFixed(2), r.claimAmount.toFixed(2),
      r.count, r.hv, r.lv, ...data.couriers.map(c => r.byCourier[c] || 0),
    ])]
    const csv = lines.map(l => l.join(',')).join('\n')
    downloadCSV(csv, `missing-parcels-report-${granularity}.csv`)
  }

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

      {data && !loading && (
        <>
          {data.noDateCount > 0 && (
            <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
              {data.noDateCount} claim{data.noDateCount === 1 ? '' : 's'} with no date recorded aren't included in any period below (still counted in the Missing Parcels stats bar).
            </div>
          )}

          {/* --- Cost Summary --- */}
          <div className="chart-card">
            <div className="chart-card-title">{granularity[0].toUpperCase() + granularity.slice(1)}ly Cost Summary</div>
            <div className="table-wrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th style={{ textAlign: 'right' }}>Count</th>
                    <th style={{ textAlign: 'right' }}>Retail</th>
                    <th style={{ textAlign: 'right' }}>Cost</th>
                    <th style={{ textAlign: 'right' }}>Claim Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.period}>
                      <td>{fmtPeriod(r.period, data.granularity)}</td>
                      <td style={{ textAlign: 'right' }}>{r.count}</td>
                      <td style={{ textAlign: 'right' }}>{fmtGbp(r.retail)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtGbp(r.cost)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtGbp(r.claimAmount)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, background: '#f8faf9' }}>
                    <td>Grand Total</td>
                    <td style={{ textAlign: 'right' }}>{data.grand.count}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(data.grand.retail)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(data.grand.cost)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtGbp(data.grand.claimAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- HV/LV Summary --- */}
          <div className="chart-card">
            <div className="chart-card-title">{granularity[0].toUpperCase() + granularity.slice(1)}ly HV/LV Summary</div>
            <div className="table-wrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th style={{ textAlign: 'right' }}>HV</th>
                    <th style={{ textAlign: 'right' }}>LV</th>
                    <th style={{ textAlign: 'right' }}>HV %</th>
                    <th style={{ textAlign: 'right' }}>LV %</th>
                    <th style={{ textAlign: 'right' }}>Total Tagged</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => {
                    const tagged = r.hv + r.lv
                    return (
                      <tr key={r.period}>
                        <td>{fmtPeriod(r.period, data.granularity)}</td>
                        <td style={{ textAlign: 'right' }}>{r.hv}</td>
                        <td style={{ textAlign: 'right' }}>{r.lv}</td>
                        <td style={{ textAlign: 'right' }}>{pct(r.hv, tagged)}</td>
                        <td style={{ textAlign: 'right' }}>{pct(r.lv, tagged)}</td>
                        <td style={{ textAlign: 'right' }}>{tagged}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ fontWeight: 700, background: '#f8faf9' }}>
                    <td>Grand Total</td>
                    <td style={{ textAlign: 'right' }}>{data.grand.hv}</td>
                    <td style={{ textAlign: 'right' }}>{data.grand.lv}</td>
                    <td style={{ textAlign: 'right' }}>{pct(data.grand.hv, data.grand.hv + data.grand.lv)}</td>
                    <td style={{ textAlign: 'right' }}>{pct(data.grand.lv, data.grand.hv + data.grand.lv)}</td>
                    <td style={{ textAlign: 'right' }}>{data.grand.hv + data.grand.lv}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Courier Summary --- */}
          <div className="chart-card">
            <div className="chart-card-title">{granularity[0].toUpperCase() + granularity.slice(1)}ly Courier Summary</div>
            <div className="table-wrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th>Period</th>
                    {data.couriers.map(c => <th key={c} style={{ textAlign: 'right' }}>{c}</th>)}
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.period}>
                      <td>{fmtPeriod(r.period, data.granularity)}</td>
                      {data.couriers.map(c => <td key={c} style={{ textAlign: 'right' }}>{r.byCourier[c] || ''}</td>)}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.count}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, background: '#f8faf9' }}>
                    <td>Grand Total</td>
                    {data.couriers.map(c => <td key={c} style={{ textAlign: 'right' }}>{data.grand.byCourier[c] || 0}</td>)}
                    <td style={{ textAlign: 'right' }}>{data.grand.count}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Overall breakdown: Stage & Claim Status percentages (grand total, not per-period) --- */}
          <div className="chart-card">
            <div className="chart-card-title">Overall Breakdown (all periods combined)</div>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>By Stage</div>
                {STAGES.map(s => {
                  const n = data.grand.byStage[s.value] || 0
                  if (!n) return null
                  return (
                    <div key={s.value} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13, padding: '3px 0', minWidth: 220 }}>
                      <span><span className={`status-badge ${s.colour}`} style={{ marginRight: 6 }}>{s.label}</span></span>
                      <span>{n} ({pct(n, data.grand.count)})</span>
                    </div>
                  )
                })}
              </div>
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>By Claim Status</div>
                {CLAIM_STATUSES.map(s => {
                  const n = data.grand.byClaimStatus[s.value] || 0
                  if (!n) return null
                  return (
                    <div key={s.value} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13, padding: '3px 0', minWidth: 220 }}>
                      <span><span className={`status-badge ${s.colour}`} style={{ marginRight: 6 }}>{s.label}</span></span>
                      <span>{n} ({pct(n, data.grand.count)})</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
