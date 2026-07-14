import { shopifyGraphQL } from '../shopify.js'

export const ZERO_STOCK_QUERY = `
  query ZeroStock($cursor: String, $filter: String!) {
    products(first: 80, after: $cursor, query: $filter) {
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
          tags
          status
          createdAt
          variants(first: 100) {
            edges {
              node {
                legacyResourceId
                sku
                title
                price
                inventoryQuantity
                inventoryItem {
                  inventoryLevels(first: 5) {
                    edges {
                      node {
                        quantities(names: ["on_hand"]) {
                          quantity
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
  }
`

export function buildZeroStockFilter({ vendor, productType } = {}) {
  let filter = 'status:active inventory_total:0'
  if (vendor) filter += ` vendor:'${vendor}'`
  if (productType) filter += ` product_type:'${productType}'`
  return filter
}

export async function fetchZeroStockPage(cursor, filter) {
  const data = await shopifyGraphQL(ZERO_STOCK_QUERY, { filter, ...(cursor ? { cursor } : {}) })
  const page = data.products

  const rows = page.edges.flatMap(({ node: product }) =>
    product.variants.edges
      .map(({ node: v }) => {
        const onHand = (v.inventoryItem?.inventoryLevels?.edges || [])
          .reduce((sum, { node: l }) => sum + (l.quantities?.[0]?.quantity ?? 0), 0)
        return {
          'Product ID':   product.legacyResourceId,
          'Variant ID':   v.legacyResourceId,
          'Title':        product.title,
          'Variant':      v.title !== 'Default Title' ? v.title : '',
          'SKU':          v.sku || '',
          'Type':         product.productType || '',
          'Brand':        product.vendor || '',
          'Tags':         (product.tags || []).join(', '),
          'Price':        v.price,
          'Inventory':    onHand,
          'Date Created': product.createdAt ? product.createdAt.slice(0, 10) : '',
        }
      })
      .filter(row => row['Inventory'] === 0)
  )

  return { rows, nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null }
}

// Loops until exhausted — only safe to call somewhere with a large execution
// budget (e.g. a scheduled function), not a page-triggered Netlify function.
export async function fetchAllZeroStockProducts(filter = buildZeroStockFilter()) {
  let cursor = null
  let allRows = []
  do {
    const { rows, nextCursor } = await fetchZeroStockPage(cursor, filter)
    allRows = allRows.concat(rows)
    cursor = nextCursor
  } while (cursor)
  return allRows
}
