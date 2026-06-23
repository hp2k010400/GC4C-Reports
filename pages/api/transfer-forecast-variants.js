import { shopifyGetOne } from '../../lib/shopify.js'

// Given a list of variant IDs (from order line items), returns their inventory_item_ids.
// Much faster than scanning all 37k+ active variants — only fetches variants that were actually sold.
const BATCH = 250

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { ids } = req.body || {}
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' })

  try {
    const batches = []
    for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH))

    const results = await Promise.all(
      batches.map(batch =>
        shopifyGetOne('variants.json', { ids: batch.join(','), limit: 250, fields: 'id,inventory_item_id,inventory_quantity,requires_shipping' })
          .then(d => d.variants || [])
          .catch(() => [])
      )
    )

    // variantId -> inventoryItemId
    const map = {}
    for (const variants of results) {
      for (const v of variants) {
        if (v.id && v.inventory_item_id) map[String(v.id)] = {
          iid: v.inventory_item_id,
          stock: v.inventory_quantity ?? 0,
          requiresShipping: v.requires_shipping !== false,
        }
      }
    }

    res.status(200).json({ map })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
