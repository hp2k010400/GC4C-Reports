import { getStore } from '@netlify/blobs'
import { shopifyGraphQL } from '../../lib/shopify.js'

const FALLBACK_REASON_MAP = {
  'Damaged':                   'damaged',
  'Found — count correction':  'correction',
  'Missing — count correction':'correction',
  'Theft':                     'shrinkage',
  'Sample / Demo':             'promotion',
  'Sent for Repair':           'quality_control',
  'Returned to Stock':         'received',
  'Other':                     'other',
}

async function getReasonMap() {
  try {
    const store = getStore('gc4c-settings')
    const data = await store.get('reason-codes', { type: 'json' })
    if (Array.isArray(data)) {
      return Object.fromEntries(data.map(c => [c.label, c.shopifyCode]))
    }
  } catch {}
  return FALLBACK_REASON_MAP
}

const ADJUST_MUTATION = `
  mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!) {
    inventoryAdjustQuantities(input: $input) {
      userErrors { field message }
      inventoryAdjustmentGroup {
        changes { quantityAfterChange }
      }
    }
  }
`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { items, reason, notes, employee } = req.body

  if (!Array.isArray(items) || !items.length || !employee?.trim()) {
    return res.status(400).json({ error: 'Missing or invalid fields' })
  }

  const reasonMap = await getReasonMap()
  const shopifyReason = reasonMap[reason] || 'correction'

  try {
    const changes = items.map(item => ({
      inventoryItemId: `gid://shopify/InventoryItem/${item.inventoryItemId}`,
      locationId: `gid://shopify/Location/${item.locationId}`,
      delta: parseInt(item.adjustment),
    }))

    const data = await shopifyGraphQL(ADJUST_MUTATION, {
      input: { reason: shopifyReason, name: 'available', changes },
    })

    const userErrors = data.inventoryAdjustQuantities?.userErrors || []
    if (userErrors.length) {
      return res.status(400).json({ error: userErrors.map(e => e.message).join(', ') })
    }

    const resultChanges = data.inventoryAdjustQuantities?.inventoryAdjustmentGroup?.changes || []

    try {
      const store = getStore('gc4c-adjustments')
      const monthKey = new Date().toISOString().slice(0, 7)
      const existing = await store.get(monthKey, { type: 'json' }).catch(() => null)
      const log = Array.isArray(existing) ? existing : []
      items.forEach((item, i) => {
        log.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          sku: item.sku, productTitle: item.productTitle, variantTitle: item.variantTitle,
          inventoryItemId: item.inventoryItemId, locationId: parseInt(item.locationId), locationName: item.locationName,
          adjustment: parseInt(item.adjustment),
          newQuantity: resultChanges[i]?.quantityAfterChange ?? null,
          cost: item.cost ?? '',
          reason, notes: notes || '', employee: employee.trim(),
        })
      })
      await store.set(monthKey, JSON.stringify(log))
    } catch {}

    res.status(200).json({ ok: true, count: items.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
