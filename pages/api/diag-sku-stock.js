import { shopifyGetOne, shopifyFetchPage } from '../../lib/shopify.js'

// Diagnostic: traces exactly where stock is for a given SKU
// Usage: /api/diag-sku-stock?sku=100854E
export default async function handler(req, res) {
  const { sku } = req.query
  if (!sku) return res.status(400).json({ error: 'sku param required' })

  try {
    // Step 1: find the variant by SKU
    const variantSearch = await shopifyGetOne('variants.json', { sku, limit: 5, fields: 'id,sku,inventory_item_id,inventory_quantity' })
    const variants = variantSearch.variants || []

    if (!variants.length) return res.status(200).json({ sku, error: 'No variants found with this SKU' })

    const variant = variants[0]

    // Step 2: get inventory levels for this inventory_item_id
    // Step 2: get all locations for reference
    const locsData = await shopifyGetOne('locations.json', { limit: 250 })
    const locationMap = {}
    for (const l of (locsData.locations || [])) locationMap[l.id] = l.name

    // Step 3: GraphQL for all quantity types
    const { shopifyGraphQL } = await import('../../lib/shopify.js')
    const gid = `gid://shopify/InventoryItem/${variant.inventory_item_id}`
    const gqlData = await shopifyGraphQL(`
      query {
        node(id: "${gid}") {
          ... on InventoryItem {
            id
            inventoryLevels(first: 20) {
              edges {
                node {
                  location { legacyResourceId name }
                  quantities(names: ["available", "on_hand", "committed", "incoming", "reserved"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    `)

    const gqlLevels = gqlData?.node?.inventoryLevels?.edges || []

    res.status(200).json({
      sku,
      variant_id: variant.id,
      inventory_item_id: variant.inventory_item_id,
      inventory_quantity_on_variant: variant.inventory_quantity,
      levels: gqlLevels.map(({ node }) => ({
        location_id: node.location?.legacyResourceId,
        location_name: node.location?.name,
        quantities: Object.fromEntries((node.quantities || []).map(q => [q.name, q.quantity])),
      })),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
