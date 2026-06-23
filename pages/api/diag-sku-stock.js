import { shopifyGraphQL } from '../../lib/shopify.js'

// Diagnostic: traces exactly where stock is for a given SKU
// Usage: /api/diag-sku-stock?sku=100854E
export default async function handler(req, res) {
  const { sku } = req.query
  if (!sku) return res.status(400).json({ error: 'sku param required' })

  try {
    // Find the correct variant via GraphQL (REST variants.json ignores sku param)
    const variantSearch = await shopifyGraphQL(`
      query {
        productVariants(first: 3, query: "sku:'${sku}'") {
          edges {
            node {
              id
              sku
              inventoryManagement
              inventoryItem {
                id
                legacyResourceId
                tracked
              }
            }
          }
        }
      }
    `)

    const edges = variantSearch?.productVariants?.edges || []
    if (!edges.length) return res.status(200).json({ sku, error: 'No variants found with this SKU' })

    const variant = edges[0].node
    const iidGid = variant.inventoryItem?.id
    const iid = variant.inventoryItem?.legacyResourceId

    // Get all quantity types per location
    const gqlData = await shopifyGraphQL(`
      query {
        node(id: "${iidGid}") {
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
      inventory_item_id: iid,
      inventory_management: variant.inventoryManagement,
      tracked: variant.inventoryItem?.tracked,
      levels: gqlLevels.map(({ node }) => ({
        location_name: node.location?.name,
        location_id: node.location?.legacyResourceId,
        quantities: Object.fromEntries((node.quantities || []).map(q => [q.name, q.quantity])),
      })),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
