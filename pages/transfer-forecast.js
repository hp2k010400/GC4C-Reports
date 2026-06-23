import { useState, useEffect, useMemo } from 'react'

const WEEKS = 26
const today = () => new Date().toISOString().slice(0, 10)
const weeksAgo = n => new Date(Date.now() - n * 7 * 86400000).toISOString().slice(0, 10)

function toCSV(rows, weeksCover) {
  const headers = [
    'SKU', 'Product', 'Variant', 'Location',
    'Avg Weekly Sales', 'Current Store Stock', `Target Stock (${weeksCover}wk)`, 'Suggested Transfer',
  ]
  const data = rows.map(r => [
    r.sku, r.title, r.variant, r.locationName,
    r.avgWeeklySales.toFixed(2), r.currentStock, r.targetStock, r.suggestedTransfer,
  ])
  return [headers, ...data]
    .map(row => row.map(v => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
}

function downloadCSV(rows, weeksCover) {
  const blob = new Blob([toCSV(rows, weeksCover)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `transfer-forecast-${today()}.csv`; a.click()
  URL.revokeObjectURL(url)
}

export default function TransferForecastPage() {
  const [locations, setLocations] = useState([])
  const [warehouseId, setWarehouseId] = useState('') // auto-detected, used to exclude warehouse from order fetch
  const [weeksCover, setWeeksCover] = useState(3)
  const [weeksCoverInput, setWeeksCoverInput] = useState('3')

  const [loadingPhase, setLoadingPhase] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const [productMap, setProductMap] = useState(null)         // sku -> { title, variant }
  const [stockMap, setStockMap] = useState(null)             // sku -> inventory_quantity (variant total)
  const [salesMap, setSalesMap] = useState(null)             // locationId -> sku -> totalQty
  const [newProductSkus, setNewProductSkus] = useState(null) // Set of SKUs tagged 'new product'

  const [filterLocation, setFilterLocation] = useState('')
  const [excludeKeywords, setExcludeKeywords] = useState('Charge, Staff Purchase, Adapter Change')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('suggestedTransfer')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    fetch('/api/locations')
      .then(r => r.json())
      .then(d => {
        const locs = d.locations || []
        setLocations(locs)
        const wh = locs.find(l => /newbridge|warehouse|external|storage/i.test(l.name))
        if (wh) setWarehouseId(String(wh.id))
      })
      .catch(() => {})
  }, [])

  async function loadData() {
    setError(null)
    setProductMap(null)
    setStockMap(null)
    setSalesMap(null)
    setNewProductSkus(null)

    try {
      // --- Phase 1: POS orders — all store locations in parallel ---
      setLoadingPhase('orders')
      const storeLocations = locations.filter(l => String(l.id) !== warehouseId)
      const startDate = weeksAgo(WEEKS)
      const endDate = today()

      let totalItems = 0
      const salesAgg = {}
      const skuToMeta = {}
      const skuToVariantId = {}

      await Promise.all(storeLocations.map(async loc => {
        const locId = String(loc.id)
        salesAgg[locId] = {}
        let pageInfo = null

        do {
          const params = new URLSearchParams({ startDate, endDate, location_id: loc.id })
          if (pageInfo) params.set('page_info', pageInfo)
          const res = await fetch(`/api/transfer-forecast-orders?${params}`)
          let json
          try { json = await res.json() } catch { throw new Error(`Orders request timed out for ${loc.name}`) }
          if (!res.ok) throw new Error(json.error)

          for (const row of json.rows) {
            salesAgg[locId][row.sku] = (salesAgg[locId][row.sku] || 0) + row.qty
            if (!skuToMeta[row.sku])      skuToMeta[row.sku]      = { title: row.title, variant: row.variantTitle }
            if (!skuToVariantId[row.sku]) skuToVariantId[row.sku] = row.variantId
            totalItems++
          }
          pageInfo = json.nextPageInfo
          setProgress({ count: totalItems })
        } while (pageInfo)
      }))

      setProductMap(skuToMeta)

      // --- Phase 2: Variant stock (inventory_quantity = total across all locations) ---
      // GC4C uses per-store variants (E/W/M/S suffix), so variant.inventory_quantity
      // is the correct "store stock" — not per-location inventory.
      setLoadingPhase('inventory')
      setProgress(null)

      const variantIds = Object.values(skuToVariantId).filter(Boolean)
      let variantData = {}
      if (variantIds.length > 0) {
        const res = await fetch('/api/transfer-forecast-variants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: variantIds }),
        })
        const json = await res.json()
        if (res.ok) variantData = json.map || {}
      }

      const skuToStock = {}
      for (const [sku, vid] of Object.entries(skuToVariantId)) {
        const entry = variantData[String(vid)]
        if (entry) skuToStock[sku] = entry.stock ?? 0
      }
      setStockMap(skuToStock)

      // --- Phase 3: New Product tagged SKUs ---
      setLoadingPhase('newproduct')
      const npRes = await fetch('/api/new-product-skus')
      const npJson = await npRes.json()
      setNewProductSkus(new Set(npJson.skus || []))

      setSalesMap(salesAgg)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingPhase(null)
      setProgress(null)
    }
  }

  const storeLocations = useMemo(() => {
    if (!warehouseId) return locations
    return locations.filter(l => String(l.id) !== warehouseId)
  }, [locations, warehouseId])

  const rows = useMemo(() => {
    if (!salesMap || !stockMap || !productMap || !newProductSkus) return []

    const result = []
    for (const [locId, skuQtyMap] of Object.entries(salesMap)) {
      const loc = locations.find(l => String(l.id) === locId)
      if (!loc) continue

      for (const [sku, totalQty] of Object.entries(skuQtyMap)) {
        if (!newProductSkus.has(sku)) continue  // only 'new product' tagged items

        const currentStock = stockMap[sku] ?? 0
        const avgWeeklySales = totalQty / WEEKS
        const targetStock = Math.ceil(avgWeeklySales * weeksCover)
        const suggestedTransfer = targetStock - currentStock
        if (suggestedTransfer <= 0) continue

        const meta = productMap[sku] || { title: sku, variant: '' }
        result.push({
          sku,
          locationId: locId,
          locationName: loc.name,
          title: meta.title,
          variant: meta.variant,
          avgWeeklySales,
          currentStock,
          targetStock,
          suggestedTransfer,
        })
      }
    }
    return result
  }, [salesMap, stockMap, productMap, newProductSkus, weeksCover, locations])

  const filteredRows = useMemo(() => {
    const excludeTerms = excludeKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    let r = rows
    if (excludeTerms.length) r = r.filter(row => !excludeTerms.some(t => row.title.toLowerCase().includes(t)))
    if (filterLocation) r = r.filter(row => row.locationId === filterLocation)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      r = r.filter(row => row.sku.toLowerCase().includes(q) || row.title.toLowerCase().includes(q))
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...r].sort((a, b) => {
      const av = a[sortField] ?? 0
      const bv = b[sortField] ?? 0
      if (typeof av === 'number') return dir * (av - bv)
      return dir * String(av).localeCompare(String(bv))
    })
  }, [rows, excludeKeywords, filterLocation, searchQuery, sortField, sortDir])

  const stats = useMemo(() => {
    if (!rows.length) return null
    const totalUnits = rows.reduce((s, r) => s + r.suggestedTransfer, 0)
    const locs = new Set(rows.map(r => r.locationId)).size
    return { skus: rows.length, totalUnits, locs }
  }, [rows])

  function handleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function si(field) { return sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '' }

  const isLoaded = salesMap !== null
  const isLoading = loadingPhase !== null
  const NUMERIC_COLS = ['avgWeeklySales', 'currentStock', 'targetStock', 'suggestedTransfer']

  return (
    <div className="container-xl">
      <div className="page-title">Transfer Forecast</div>
      <div className="page-sub">
        Recommended transfers from External Storage to each store for products tagged <strong>New Product</strong>,
        based on {WEEKS} weeks of POS sales. Target Stock = Avg Weekly Sales × Weeks Cover.
      </div>

      <div className="load-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 13, color: '#333', whiteSpace: 'nowrap' }}>Weeks Cover</label>
          <input
            type="number"
            min={1} max={52}
            value={weeksCoverInput}
            onChange={e => {
              setWeeksCoverInput(e.target.value)
              const n = parseInt(e.target.value)
              if (n >= 1 && n <= 52) setWeeksCover(n)
            }}
            style={{ width: 64, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
          />
          <span style={{ fontSize: 12, color: '#888' }}>weeks (default 3)</span>
        </div>

        <button className="btn btn-primary" onClick={loadData} disabled={isLoading}>
          {isLoading ? 'Loading…' : isLoaded ? 'Reload' : 'Load Forecast'}
        </button>

        {isLoaded && !isLoading && (
          <span className="load-count">{rows.length.toLocaleString()} recommendations</span>
        )}
      </div>

      {isLoading && (
        <div className="state-box">
          <div className="spinner" />
          <div style={{ fontWeight: 500 }}>
            {loadingPhase === 'orders'     && `Loading orders… ${(progress?.count ?? 0).toLocaleString()} items`}
            {loadingPhase === 'inventory'  && 'Loading stock levels…'}
            {loadingPhase === 'newproduct' && 'Loading New Product catalogue…'}
          </div>
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>
            {loadingPhase === 'orders'     && `Fetching ${WEEKS} weeks of POS sales from all stores`}
            {loadingPhase === 'inventory'  && 'Fetching per-location stock levels'}
            {loadingPhase === 'newproduct' && 'Fetching SKUs tagged New Product from Shopify'}
          </div>
        </div>
      )}

      {error && <div className="state-box error">Error: {error}</div>}

      {isLoaded && !isLoading && (
        <>
          {stats && (
            <div className="stats-bar">
              <div className="stat-card"><div className="stat-label">Recommendations</div><div className="stat-value">{stats.skus.toLocaleString()}</div></div>
              <div className="stat-card"><div className="stat-label">Total Units</div><div className="stat-value">{stats.totalUnits.toLocaleString()}</div></div>
              <div className="stat-card"><div className="stat-label">Stores</div><div className="stat-value">{stats.locs}</div></div>
              <div className="stat-card"><div className="stat-label">Weeks Cover</div><div className="stat-value">{weeksCover}</div></div>
            </div>
          )}

          <div className="load-bar" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
            <select className="type-select" value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
              <option value="">All locations</option>
              {storeLocations.map(l => (
                <option key={l.id} value={String(l.id)}>{l.name}</option>
              ))}
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>Exclude titles:</label>
              <input
                type="text"
                value={excludeKeywords}
                onChange={e => setExcludeKeywords(e.target.value)}
                placeholder="e.g. Charge, Staff"
                style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, width: 200 }}
              />
            </div>

            <input
              className="search-input"
              type="text"
              placeholder="Search SKU or product…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1, maxWidth: 280 }}
            />

            {filteredRows.length > 0 && (
              <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => downloadCSV(filteredRows, weeksCover)}>
                Download CSV
              </button>
            )}
          </div>

          <div className="results-bar">
            <span className="results-count">
              {filteredRows.length.toLocaleString()} of {rows.length.toLocaleString()} recommendations
            </span>
          </div>

          {filteredRows.length === 0 ? (
            <div className="state-box">No transfer recommendations match the current filters.</div>
          ) : (
            <div className="table-wrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    {[
                      ['sku',               'SKU',          null],
                      ['title',             'Product',      null],
                      ['locationName',      'Location',     null],
                      ['avgWeeklySales',    'Avg Weekly',   'Sales / wk'],
                      ['currentStock',      'Store Stock',  'Current'],
                      ['targetStock',       'Target Stock', `${weeksCover}× cover`],
                      ['suggestedTransfer', 'Transfer',     'Suggested'],
                    ].map(([field, label, sub]) => (
                      <th
                        key={field}
                        onClick={() => handleSort(field)}
                        style={{ cursor: 'pointer', userSelect: 'none', textAlign: NUMERIC_COLS.includes(field) ? 'right' : 'left' }}
                      >
                        <span style={{ whiteSpace: 'nowrap' }}>{label}{si(field)}</span>
                        {sub && <div className="col-sub">{sub}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr key={i}>
                      <td className="sku-cell">{row.sku}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{row.title}</div>
                        {row.variant && <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{row.variant}</div>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{row.locationName}</td>
                      <td style={{ textAlign: 'right' }}>{row.avgWeeklySales.toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{row.currentStock}</td>
                      <td style={{ textAlign: 'right' }}>{row.targetStock}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#005F2C', fontSize: 15 }}>
                        {row.suggestedTransfer}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
