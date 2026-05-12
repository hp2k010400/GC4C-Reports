import { getStore } from '@netlify/blobs'

const STORE = process.env.SHOPIFY_STORE
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const API = '2025-04'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const {
    inventoryItemId, locationId, adjustment,
    sku, productTitle, variantTitle, locationName,
    reason, notes, employee,
  } = req.body

  const adj = parseInt(adjustment)
  if (!inventoryItemId || !locationId || isNaN(adj) || adj === 0 || !employee?.trim()) {
    return res.status(400).json({ error: 'Missing or invalid fields' })
  }

  try {
    const shopifyRes = await fetch(
      `https://${STORE}/admin/api/${API}/inventory_levels/adjust.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location_id: parseInt(locationId),
          inventory_item_id: parseInt(inventoryItemId),
          available_adjustment: adj,
        }),
      }
    )

    if (!shopifyRes.ok) {
      const text = await shopifyRes.text()
      throw new Error(`Shopify: ${text}`)
    }

    const shopifyData = await shopifyRes.json()
    const newQuantity = shopifyData.inventory_level?.available ?? null

    try {
      const store = getStore('gc4c-adjustments')
      const monthKey = new Date().toISOString().slice(0, 7)
      const existing = await store.get(monthKey, { type: 'json' }).catch(() => null)
      const log = Array.isArray(existing) ? existing : []
      log.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        sku, productTitle, variantTitle,
        inventoryItemId, locationId: parseInt(locationId), locationName,
        adjustment: adj, newQuantity,
        reason, notes: notes || '', employee: employee.trim(),
      })
      await store.set(monthKey, JSON.stringify(log))
    } catch {}

    res.status(200).json({ ok: true, newQuantity })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
