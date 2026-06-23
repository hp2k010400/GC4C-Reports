import { shopifyGraphQL } from '../../lib/shopify.js'

// Given a list of SKUs, returns their current inventory_item_ids via GraphQL SKU search.
// This is correct even when variant IDs on order line items are stale (deleted/recreated variants).
const BATCH = 20 // 20 aliases per GraphQL request — safe within cost limits

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { skus } = req.body || {}
  if (!Array.isArray(skus) || !skus.length) return res.status(400).json({ error: 'skus array required' })

  try {
    const batches = []
    for (let i = 0; i < skus.length; i += BATCH) batches.push(skus.slice(i, i + BATCH))

    const map = {}

    await Promise.all(batches.map(async (batch) => {
      const fields = batch.map((sku, i) => {
        const escaped = sku.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        return `v${i}: productVariants(first: 1, query: "sku:\\"${escaped}\\"") {
          edges { node { sku inventoryItem { id } } }
        }`
      }).join('\n')

      const result = await shopifyGraphQL(`{ ${fields} }`, {}).catch(() => ({}))

      for (let i = 0; i < batch.length; i++) {
        const data = result[`v${i}`]
        const node = data?.edges?.[0]?.node
        if (!node?.sku || !node?.inventoryItem?.id) continue
        const iid = node.inventoryItem.id.split('/').pop()
        map[node.sku] = { iid }
      }
    }))

    res.status(200).json({ map })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
