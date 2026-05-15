import { getStore } from '@netlify/blobs'
import { shopifyGraphQL } from '../../lib/shopify.js'

const FALLBACK_REASON_MAP = {
  'Damaged':                   'damaged',
  'Found — count correction':  'correction',
  'Missing — count correction':'correction',
  'Theft':                     'theft_or_loss',
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

  const {
    inventoryItemId, locationId, adjustment,
    sku, productTitle, variantTitle, locationName,
    reason, notes, employee,
  } = req.body

  const adj = parseInt(adjustment)
  if (!inventoryItemId || !locationId || isNaN(adj) || adj === 0 || !employee?.trim()) {
    return res.status(400).json({ error: 'Missing or invalid fields' })
  }

  const reasonMap = await getReasonMap()
  const shopifyReason = reasonMap[reason] || 'correction'

  try {
    const data = await shopifyGraphQL(ADJUST_MUTATION, {
      input: {
        reason: shopifyReason,
        name: `${reason}${notes ? ' — ' + notes : ''}`,
        changes: [{
          inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
          locationId: `gid://shopify/Location/${locationId}`,
          delta: adj,
        }],
      },
    })

    const userErrors = data.inventoryAdjustQuantities?.userErrors || []
    if (userErrors.length) {
      return res.status(400).json({ error: userErrors.map(e => e.message).join(', ') })
    }

    const changes = data.inventoryAdjustQuantities?.inventoryAdjustmentGroup?.changes || []
    const newQuantity = changes[0]?.quantityAfterChange ?? null

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
