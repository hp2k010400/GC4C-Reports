import { shopifyGraphQL } from '../../lib/shopify.js'

// Fetch all active inventory transfers and return their SKUs
// Active = NOT transferred (success) and NOT cancelled
const TRANSFERS_QUERY = `
  query GetTransfers($cursor: String) {
    inventoryTransfers(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          status
          lineItems(first: 250) {
            edges {
              node {
                inventoryItem {
                  id
                  sku
                }
                variant {
                  id
                }
              }
            }
          }
        }
      }
    }
  }
`

const ACTIVE_STATUSES = ['DRAFT', 'READY_TO_SHIP', 'IN_PROGRESS']

export default async function handler(_req, res) {
  try {
    const skuSet = new Set()
    let cursor = null

    do {
      const data = await shopifyGraphQL(TRANSFERS_QUERY, { cursor })
      const transfers = data.inventoryTransfers?.edges || []

      for (const { node } of transfers) {
        if (!ACTIVE_STATUSES.includes(node.status)) continue
        for (const { node: item } of (node.lineItems?.edges || [])) {
          if (item.inventoryItem?.sku) skuSet.add(item.inventoryItem.sku)
        }
      }

      const pageInfo = data.inventoryTransfers?.pageInfo
      cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null
    } while (cursor)

    res.status(200).json({ skus: [...skuSet] })
  } catch (err) {
    // If transfers API not available on this plan, return empty
    res.status(200).json({ skus: [], warning: err.message })
  }
}
