import { shopifyGraphQL } from '../shopify.js'

// GC4C has 6 total locations (incl. one inactive one hidden from the
// location picker) — inventoryLevels(first: 5) was silently truncating and
// dropping whichever location sorted last for a given item, which was
// skewing External Storage's totals low. 10 gives headroom for future
// locations too.
export const STOCK_VALUE_QUERY = `
  query StockValue($cursor: String, $filter: String!) {
    products(first: 60, after: $cursor, query: $filter, sortKey: ID) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          legacyResourceId
          title
          vendor
          productType
          variants(first: 50) {
            edges {
              node {
                legacyResourceId
                sku
                title
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

// No status filter on purpose — this is a physical stock asset value, which
// should count everything actually owned regardless of whether it's
// currently published for sale. Draft/archived stock sits almost entirely
// in the warehouse (External Storage): excluding it here was the real cause
// of that location's total running short against Ablestar's export.
export function buildStockValueFilter() {
  return 'inventory_total:>0'
}

export async function fetchStockValuePage(cursor, filter) {
  const data = await shopifyGraphQL(STOCK_VALUE_QUERY, { filter, ...(cursor ? { cursor } : {}) })
  const page = data.products

  // One row per (variant, location) — mirrors on-hand per location, which is
  // what "stock on hand" actually means (available can differ per location
  // due to commitments; on_hand is the physical count we were asked for).
  const rows = page.edges.flatMap(({ node: product }) =>
    product.variants.edges.flatMap(({ node: v }) => {
      const unitCost = parseFloat(v.inventoryItem?.unitCost?.amount || 0)
      const levels = v.inventoryItem?.inventoryLevels?.edges || []
      return levels
        .map(({ node: l }) => ({
          'Product ID':  product.legacyResourceId,
          'Variant ID':  v.legacyResourceId,
          'Title':       product.title,
          'Variant':     v.title !== 'Default Title' ? v.title : '',
          'SKU':         v.sku || '',
          'Type':        product.productType || '',
          'Brand':       product.vendor || '',
          'Location ID': l.location?.legacyResourceId || '',
          'Location':    l.location?.name || '',
          'On Hand':     l.quantities?.[0]?.quantity ?? 0,
          'Unit Cost':   unitCost,
        }))
        .filter(row => row['On Hand'] > 0)
    })
  )

  return { rows, nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null }
}
