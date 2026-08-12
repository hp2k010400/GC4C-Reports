import { useState, useEffect, useCallback } from 'react'
import { STAGES, CLAIM_STATUSES, fmtGbp } from '../lib/parcelClaims'

function currentPeriodKey(granularity) {
  const now = new Date()
  const iso = now.toISOString().slice(0, 10)
  if (granularity === 'month') return iso.slice(0, 7)
  if (granularity === 'day') return iso
  // week: Monday-start ISO week, matches the API's bucketing
  const day = now.getUTCDay() || 7
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - day + 1)
  return monday.toISOString().slice(0, 10)
}

function periodLabel(granularity) {
  if (granularity === 'month') return 'This Month'
  if (granularity === 'week') return 'This Week'
  return 'Today'
}

function pct(n, total) {
  if (!total) return '—'
  return `${Math.round((n / total) * 100)}%`
}

const emptyBucket = { retail: 0, cost: 0, claimAmount: 0, count: 0, hv: 0, lv: 0, byCourier: {}, byStage: {}, byClaimStatus: {} }

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

  const current = data?.rows.find(r => r.period === currentPeriodKey(granularity)) || emptyBucket
  const tagged = current.hv + current.lv

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
        </div>
      </div>

      {loading && <div className="state-box"><div className="spinner" />Loading report…</div>}
      {error && <div className="state-box error">Error: {error}</div>}

      {data && !loading && (
        <div className="chart-card">
          <div className="chart-card-title">{periodLabel(granularity)}</div>

          <div className="stats-bar">
            <div className="stat-card">
              <div className="stat-label">Claims</div>
              <div className="stat-value">{current.count}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Retail</div>
              <div className="stat-value">{fmtGbp(current.retail)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cost</div>
              <div className="stat-value">{fmtGbp(current.cost)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Claim Amount</div>
              <div className="stat-value">{fmtGbp(current.claimAmount)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', marginTop: 8 }}>
            <div>
              <div className="section-label" style={{ marginBottom: 8 }}>HV / LV</div>
              {tagged === 0 ? (
                <div style={{ fontSize: 13, color: '#999' }}>No claims tagged yet</div>
              ) : (
                <>
                  <div style={{ fontSize: 13, padding: '2px 0' }}>HV: {current.hv} ({pct(current.hv, tagged)})</div>
                  <div style={{ fontSize: 13, padding: '2px 0' }}>LV: {current.lv} ({pct(current.lv, tagged)})</div>
                </>
              )}
            </div>

            <div>
              <div className="section-label" style={{ marginBottom: 8 }}>Courier</div>
              {Object.keys(current.byCourier).length === 0 ? (
                <div style={{ fontSize: 13, color: '#999' }}>No claims yet</div>
              ) : (
                Object.entries(current.byCourier).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                  <div key={c} style={{ fontSize: 13, padding: '2px 0' }}>{c}: {n}</div>
                ))
              )}
            </div>

            <div>
              <div className="section-label" style={{ marginBottom: 8 }}>Stage</div>
              {current.count === 0 ? (
                <div style={{ fontSize: 13, color: '#999' }}>No claims yet</div>
              ) : (
                STAGES.map(s => current.byStage[s.value] ? (
                  <div key={s.value} style={{ fontSize: 13, padding: '2px 0' }}>
                    <span className={`status-badge ${s.colour}`} style={{ marginRight: 6 }}>{s.label}</span>
                    {current.byStage[s.value]}
                  </div>
                ) : null)
              )}
            </div>

            <div>
              <div className="section-label" style={{ marginBottom: 8 }}>Claim Status</div>
              {current.count === 0 ? (
                <div style={{ fontSize: 13, color: '#999' }}>No claims yet</div>
              ) : (
                CLAIM_STATUSES.map(s => current.byClaimStatus[s.value] ? (
                  <div key={s.value} style={{ fontSize: 13, padding: '2px 0' }}>
                    <span className={`status-badge ${s.colour}`} style={{ marginRight: 6 }}>{s.label}</span>
                    {current.byClaimStatus[s.value]}
                  </div>
                ) : null)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
