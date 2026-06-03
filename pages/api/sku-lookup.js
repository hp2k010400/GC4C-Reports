import { shopifyGraphQL, shopifyGetOne } from '../../lib/shopify.js'

const VARIANT_BY_SKU = `
  query VariantBySku($q: String!) {
    productVariants(first: 10, query: $q) {
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

async function fetchInventory(variant) {
  const inventoryItemId = variant.inventoryItem.id.replace('gid://shopify/InventoryItem/', '')
  const [levelsData, locData, itemData] = await Promise.all([
    shopifyGetOne('inventory_levels.json', { inventory_item_ids: inventoryItemId, limit: 250 }),
    shopifyGetOne('locations.json', { limit: 250 }),
    shopifyGetOne(`inventory_items/${inventoryItemId}.json`).catch(() => ({})),
  ])
  const locMap = {}
  for (const l of locData.locations || []) locMap[l.id] = l.name
  const inventory = (levelsData.inventory_levels || [])
    .map(l => ({ locationId: l.location_id, locationName: locMap[l.location_id] || String(l.location_id), available: l.available ?? 0 }))
    .sort((a, b) => a.locationName.localeCompare(b.locationName))
  const cost = itemData.inventory_item?.cost ?? ''
  return { sku: variant.sku, productTitle: variant.product.title, variantTitle: variant.title !== 'Default Title' ? variant.title : '', inventoryItemId, inventory, cost }
}

export default async function handler(req, res) {
  const { sku, select } = req.query
  if (!sku) return res.status(400).json({ error: 'SKU required' })

  try {
    const data = await shopifyGraphQL(VARIANT_BY_SKU, { q: `sku:*${sku}*` })
    const variants = (data.productVariants?.edges || []).map(e => e.node)

    if (!variants.length) return res.status(404).json({ error: `No SKU found matching "${sku}"` })

    const exact = variants.find(v => v.sku === sku)

    // Exact match or user selected one — return full product data
    if (exact || select === '1') {
      const target = exact || variants[0]
      return res.status(200).json(await fetchInventory(target))
    }

    // Multiple partial matches — return list for user to pick from
    if (variants.length > 1) {
      return res.status(200).json({
        matches: variants.map(v => ({
          sku: v.sku,
          productTitle: v.product.title,
          variantTitle: v.title !== 'Default Title' ? v.title : '',
          inventoryItemId: v.inventoryItem.id.replace('gid://shopify/InventoryItem/', ''),
        }))
      })
    }

    // Only one result — use it directly
    return res.status(200).json(await fetchInventory(variants[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
