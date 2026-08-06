// TEMPORARY diagnostic — checks how much stock at each status (draft, archived,
// active) exists, to see if non-active products are the source of the
// External Storage discrepancy. Remove after use.
import { shopifyGraphQL } from '../../lib/shopify.js'

const QUERY = `
  query StatusCheck($cursor: String, $filter: String!) {
    products(first: 50, after: $cursor, query: $filter, sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          legacyResourceId
          status
          variants(first: 50) {
            edges {
              node {
                sku
                inventoryItem {
                  unitCost { amount }
                  inventoryLevels(first: 8) {
                    edges {
                      node {
                        location { legacyResourceId name }
                        quantities(names: ["on_hand"]) { quantity }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`

export default async function handler(req, res) {
  try {
    const status = req.query.status || 'draft'
    let cursor = req.query.page_info || null
    const filter = `status:${status} inventory_total:>0`

    let rows = []
    let pagesCount = 0
    do {
      const data = await shopifyGraphQL(QUERY, { filter, ...(cursor ? { cursor } : {}) })
      const page = data.products
      for (const { node: product } of page.edges) {
        for (const { node: v } of product.variants.edges) {
          const unitCost = parseFloat(v.inventoryItem?.unitCost?.amount || 0)
          const levels = v.inventoryItem?.inventoryLevels?.edges || []
          for (const { node: l } of levels) {
            const onHand = l.quantities?.[0]?.quantity ?? 0
            if (onHand > 0) {
              rows.push({
                status: product.status,
                sku: v.sku,
                location: l.location?.name,
                locationId: l.location?.legacyResourceId,
                onHand,
                unitCost,
              })
            }
          }
        }
      }
      cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
      pagesCount++
    } while (cursor && pagesCount < 10)

    const totalUnits = rows.reduce((s, r) => s + r.onHand, 0)
    const totalValue = rows.reduce((s, r) => s + r.onHand * r.unitCost, 0)
    const byLocation = {}
    for (const r of rows) {
      const key = r.location || 'unknown'
      if (!byLocation[key]) byLocation[key] = { units: 0, value: 0, count: 0 }
      byLocation[key].units += r.onHand
      byLocation[key].value += r.onHand * r.unitCost
      byLocation[key].count++
    }

    res.status(200).json({
      status, rowCount: rows.length, totalUnits, totalValue, byLocation, nextPageInfo: cursor,
      sample: rows.slice(0, 5),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
