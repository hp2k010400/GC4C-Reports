import { shopifyGraphQL, shopifyGetOne } from '../../lib/shopify.js'

const VARIANT_BY_SKU = `
  query VariantBySku($q: String!) {
    productVariants(first: 5, query: $q) {
      edges {
        node {
          id
          sku
          title
          product {
            id
            title
            status
          }
          inventoryItem {
            id
          }
        }
      }
    }
  }
`

export default async function handler(req, res) {
  const { sku } = req.query
  if (!sku) return res.status(400).json({ error: 'SKU required' })

  try {
    const data = await shopifyGraphQL(VARIANT_BY_SKU, { q: `sku:*${sku}*` })
    const variants = (data.productVariants?.edges || []).map(e => e.node)
    const exact = variants.find(v => v.sku === sku) || variants[0]

    if (!exact) return res.status(404).json({ error: `No SKU found matching "${sku}"` })

    const inventoryItemId = exact.inventoryItem.id.replace('gid://shopify/InventoryItem/', '')

    const [levelsData, locData] = await Promise.all([
      shopifyGetOne('inventory_levels.json', { inventory_item_ids: inventoryItemId, limit: 250 }),
      shopifyGetOne('locations.json', { limit: 250 }),
    ])

    const locMap = {}
    for (const l of locData.locations || []) locMap[l.id] = l.name

    const inventory = (levelsData.inventory_levels || [])
      .map(l => ({
        locationId: l.location_id,
        locationName: locMap[l.location_id] || String(l.location_id),
        available: l.available ?? 0,
      }))
      .sort((a, b) => a.locationName.localeCompare(b.locationName))

    res.status(200).json({
      sku: exact.sku,
      productTitle: exact.product.title,
      variantTitle: exact.title !== 'Default Title' ? exact.title : '',
      inventoryItemId,
      inventory,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
