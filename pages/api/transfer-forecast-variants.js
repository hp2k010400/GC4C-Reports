import { shopifyGraphQL } from '../../lib/shopify.js'

// Resolves inventory_item_id for each SKU via GraphQL search.
// Batches 200 SKUs per request using OR query — max ~15 GraphQL calls vs hundreds with per-SKU aliases.
const BATCH = 200

const QUERY = `
  query GetVariantsBySkus($query: String!) {
    productVariants(first: 250, query: $query) {
      edges {
        node {
          sku
          inventoryItem { id }
        }
      }
    }
  }
`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { skus } = req.body || {}
  if (!Array.isArray(skus) || !skus.length) return res.status(400).json({ error: 'skus array required' })

  try {
    const batches = []
    for (let i = 0; i < skus.length; i += BATCH) batches.push(skus.slice(i, i + BATCH))

    const map = {}

    await Promise.all(batches.map(async (batch) => {
      const queryStr = batch.map(sku => `sku:'${sku.replace(/'/g, "\\'")}'`).join(' OR ')
      const result = await shopifyGraphQL(QUERY, { query: queryStr }).catch(() => null)
      if (!result) return

      for (const { node } of (result.productVariants?.edges || [])) {
        if (!node.sku || !node.inventoryItem?.id) continue
        map[node.sku] = { iid: node.inventoryItem.id.split('/').pop() }
      }
    }))

    res.status(200).json({ map })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
