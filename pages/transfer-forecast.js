import { useState, useEffect, useMemo } from 'react'

const WEEKS = 26
const today = () => new Date().toISOString().slice(0, 10)
const weeksAgo = n => new Date(Date.now() - n * 7 * 86400000).toISOString().slice(0, 10)

function toCSV(rows, weeksCover) {
  const headers = [
    'SKU', 'Product', 'Variant', 'Type', 'Brand', 'Location',
    'Avg Weekly Sales', 'Current Store Stock', `Target Stock (${weeksCover}wk)`,
    'Ext. Storage Stock', 'Suggested Transfer',
  ]
  const data = rows.map(r => [
    r.sku,
    r.title,
    r.variant,
    r.type,
    r.brand,
    r.locationName,
    r.avgWeeklySales.toFixed(2),
    r.currentStock,
    r.targetStock,
    r.extStorageStock,
    r.suggestedTransfer,
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
  const [warehouseId, setWarehouseId] = useState('')
  const [weeksCover, setWeeksCover] = useState(3)
  const [weeksCoverInput, setWeeksCoverInput] = useState('3')

  const [loadingPhase, setLoadingPhase] = useState(null) // null | 'products' | 'orders' | 'inventory'
  const [loadingLocation, setLoadingLocation] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const [productMap, setProductMap] = useState(null)   // sku -> { title, variant, type, brand }
  const [inventoryMap, setInventoryMap] = useState(null) // sku -> locationId -> available
  const [salesMap, setSalesMap] = useState(null)        // locationId -> sku -> totalQty

  const [filterLocation, setFilterLocation] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
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
    setInventoryMap(null)
    setSalesMap(null)

    try {
      // --- Phase 1: Products (meta + iid only, no inventory) ---
      setLoadingPhase('products')
      setProgress({ count: 0 })

      const allProductRows = []
      let pageInfo = null
      do {
        const params = new URLSearchParams()
        if (pageInfo) params.set('page_info', pageInfo)
        const res = await fetch(`/api/transfer-forecast-products?${params}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        allProductRows.push(...json.rows)
        pageInfo = json.nextPageInfo
        setProgress({ count: allProductRows.length })
      } while (pageInfo)

      // Build sku -> { meta, iid }
      const skuToMeta = {}
      const skuToIid = {}
      for (const row of allProductRows) {
        if (!row.sku) continue
        skuToMeta[row.sku] = { title: row.title, variant: row.variant, type: row.type, brand: row.brand }
        if (row.iid) skuToIid[row.sku] = row.iid
      }
      setProductMap(skuToMeta)

      // --- Phase 2: POS orders per store location ---
      setLoadingPhase('orders')
      const storeLocations = locations.filter(l => String(l.id) !== warehouseId)
      const startDate = weeksAgo(WEEKS)
      const endDate = today()
      const salesAgg = {}

      for (const loc of storeLocations) {
        setLoadingLocation(loc.name)
        setProgress({ count: 0 })
        let ordersPageInfo = null
        let locTotal = 0

        do {
          const params = new URLSearchParams({ startDate, endDate, location_id: loc.id })
          if (ordersPageInfo) params.set('page_info', ordersPageInfo)
          const res = await fetch(`/api/transfer-forecast-orders?${params}`)
          let json
          try { json = await res.json() } catch { throw new Error(`Orders request timed out for ${loc.name}`) }
          if (!res.ok) throw new Error(json.error)

          const locId = String(loc.id)
          if (!salesAgg[locId]) salesAgg[locId] = {}
          for (const row of json.rows) {
            salesAgg[locId][row.sku] = (salesAgg[locId][row.sku] || 0) + row.qty
            locTotal++
          }
          ordersPageInfo = json.nextPageInfo
          setProgress({ count: locTotal })
        } while (ordersPageInfo)
      }

      // --- Phase 3: Inventory levels for sold SKUs only ---
      setLoadingPhase('inventory')
      setProgress(null)

      const soldSkus = new Set(Object.values(salesAgg).flatMap(m => Object.keys(m)))
      const soldIids = [...soldSkus].map(sku => skuToIid[sku]).filter(Boolean).map(Number)

      let inventoryLevels = []
      if (soldIids.length > 0) {
        const res = await fetch('/api/inventory-levels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: soldIids }),
        })
        const json = await res.json()
        if (res.ok) inventoryLevels = json.levels || []
      }

      // Build iid -> sku map for the reverse lookup
      const iidToSku = {}
      for (const [sku, iid] of Object.entries(skuToIid)) iidToSku[String(iid)] = sku

      const invMap = {}
      for (const level of inventoryLevels) {
        const sku = iidToSku[String(level.inventory_item_id)]
        if (!sku) continue
        if (!invMap[sku]) invMap[sku] = {}
        invMap[sku][String(level.location_id)] = level.available ?? 0
      }
      setInventoryMap(invMap)

      setSalesMap(salesAgg)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingPhase(null)
      setLoadingLocation(null)
      setProgress(null)
    }
  }

  const storeLocations = useMemo(() => {
    if (!warehouseId) return locations
    return locations.filter(l => String(l.id) !== warehouseId)
  }, [locations, warehouseId])

  const types = useMemo(() => {
    if (!productMap) return []
    return [...new Set(Object.values(productMap).map(m => m.type).filter(Boolean))].sort()
  }, [productMap])

  const brands = useMemo(() => {
    if (!productMap) return []
    return [...new Set(Object.values(productMap).map(m => m.brand).filter(Boolean))].sort()
  }, [productMap])

  const rows = useMemo(() => {
    if (!salesMap || !inventoryMap || !productMap || !warehouseId) return []

    const result = []
    for (const [locId, skuQtyMap] of Object.entries(salesMap)) {
      const loc = locations.find(l => String(l.id) === locId)
      if (!loc) continue

      for (const [sku, totalQty] of Object.entries(skuQtyMap)) {
        const extStorageStock = (inventoryMap[sku] || {})[warehouseId] ?? 0
        if (extStorageStock <= 0) continue

        const currentStock = (inventoryMap[sku] || {})[locId] ?? 0
        const avgWeeklySales = totalQty / WEEKS
        const targetStock = Math.ceil(avgWeeklySales * weeksCover)
        const raw = targetStock - currentStock
        if (raw <= 0) continue

        const suggestedTransfer = Math.min(raw, extStorageStock)

        const meta = productMap[sku] || { title: sku, variant: '', type: '', brand: '' }
        result.push({
          sku,
          locationId: locId,
          locationName: loc.name,
          title: meta.title,
          variant: meta.variant,
          type: meta.type,
          brand: meta.brand,
          avgWeeklySales,
          currentStock,
          targetStock,
          extStorageStock,
          suggestedTransfer,
        })
      }
    }
    return result
  }, [salesMap, inventoryMap, productMap, warehouseId, weeksCover, locations])

  const filteredRows = useMemo(() => {
    let r = rows
    if (filterLocation) r = r.filter(row => row.locationId === filterLocation)
    if (filterType)     r = r.filter(row => row.type === filterType)
    if (filterBrand)    r = r.filter(row => row.brand === filterBrand)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      r = r.filter(row =>
        row.sku.toLowerCase().includes(q) || row.title.toLowerCase().includes(q)
      )
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...r].sort((a, b) => {
      const av = a[sortField] ?? 0
      const bv = b[sortField] ?? 0
      if (typeof av === 'number') return dir * (av - bv)
      return dir * String(av).localeCompare(String(bv))
    })
  }, [rows, filterLocation, filterType, filterBrand, searchQuery, sortField, sortDir])

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
  const canLoad = !!warehouseId && !isLoading

  const NUMERIC_COLS = ['avgWeeklySales', 'currentStock', 'targetStock', 'extStorageStock', 'suggestedTransfer']

  return (
    <div className="container-xl">
      <div className="page-title">Transfer Forecast</div>
      <div className="page-sub">
        Recommends stock transfers from the warehouse to each store based on {WEEKS} weeks of POS sales.
        Target Stock = Avg Weekly Sales × Weeks Cover.
      </div>

      <div className="load-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 13, color: '#333', whiteSpace: 'nowrap' }}>Weeks Cover</label>
          <input
            type="number"
            min={1}
            max={52}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 13, color: '#333', whiteSpace: 'nowrap' }}>Warehouse</label>
          <select
            className="type-select"
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
          >
            <option value="">Select warehouse…</option>
            {locations.map(l => (
              <option key={l.id} value={String(l.id)}>{l.name}</option>
            ))}
          </select>
        </div>

        <button
          className="btn btn-primary"
          onClick={loadData}
          disabled={!canLoad}
          title={!warehouseId ? 'Select a warehouse location first' : ''}
        >
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
            {loadingPhase === 'products' && `Loading product catalogue… ${(progress?.count ?? 0).toLocaleString()} variants`}
            {loadingPhase === 'orders' && `Loading ${loadingLocation} orders… ${(progress?.count ?? 0).toLocaleString()} items`}
            {loadingPhase === 'inventory' && 'Loading stock levels…'}
          </div>
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 6 }}>
            {loadingPhase === 'products' && 'Fetching active products from Shopify'}
            {loadingPhase === 'orders' && `Fetching ${WEEKS} weeks of POS sales data`}
            {loadingPhase === 'inventory' && 'Fetching per-location inventory for sold SKUs only'}
          </div>
        </div>
      )}

      {error && <div className="state-box error">Error: {error}</div>}

      {isLoaded && !isLoading && (
        <>
          {stats && (
            <div className="stats-bar">
              <div className="stat-card">
                <div className="stat-label">Recommendations</div>
                <div className="stat-value">{stats.skus.toLocaleString()}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Units</div>
                <div className="stat-value">{stats.totalUnits.toLocaleString()}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Stores</div>
                <div className="stat-value">{stats.locs}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Weeks Cover</div>
                <div className="stat-value">{weeksCover}</div>
              </div>
            </div>
          )}

          <div className="load-bar" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
            <select
              className="type-select"
              value={filterLocation}
              onChange={e => setFilterLocation(e.target.value)}
            >
              <option value="">All locations</option>
              {storeLocations.map(l => (
                <option key={l.id} value={String(l.id)}>{l.name}</option>
              ))}
            </select>

            {types.length > 0 && (
              <select
                className="type-select"
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
              >
                <option value="">All types</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}

            {brands.length > 0 && (
              <select
                className="type-select"
                value={filterBrand}
                onChange={e => setFilterBrand(e.target.value)}
              >
                <option value="">All brands</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            )}

            <input
              className="search-input"
              type="text"
              placeholder="Search SKU or product…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1, maxWidth: 280 }}
            />

            {filteredRows.length > 0 && (
              <button
                className="btn btn-secondary"
                style={{ marginLeft: 'auto' }}
                onClick={() => downloadCSV(filteredRows, weeksCover)}
              >
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
                      ['sku',               'SKU',             null],
                      ['title',             'Product',         null],
                      ['locationName',      'Location',        null],
                      ['avgWeeklySales',    'Avg Weekly',      'Sales / wk'],
                      ['currentStock',      'Store Stock',     'Current'],
                      ['targetStock',       'Target Stock',    `${weeksCover}× cover`],
                      ['extStorageStock',   'Ext. Storage',    'Available'],
                      ['suggestedTransfer', 'Transfer',        'Suggested'],
                    ].map(([field, label, sub]) => (
                      <th
                        key={field}
                        onClick={() => handleSort(field)}
                        style={{
                          cursor: 'pointer',
                          userSelect: 'none',
                          textAlign: NUMERIC_COLS.includes(field) ? 'right' : 'left',
                        }}
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
                      <td style={{ textAlign: 'right' }}>{row.extStorageStock}</td>
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
