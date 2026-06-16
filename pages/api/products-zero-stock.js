import { shopifyGraphQL } from '../../lib/shopify.js'

const PAGES_PER_CALL = 12

const QUERY = `
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

export default async function handler(req, res) {
  try {
    let cursor = req.query.page_info || null
    const { vendor, productType } = req.query

    let filter = 'status:active inventory_total:0'
    if (vendor) filter += ` vendor:'${vendor}'`
    if (productType) filter += ` product_type:'${productType}'`

    let allRows = []
    let nextCursor = null
    let pagesCount = 0

    do {
      const data = await shopifyGraphQL(QUERY, { filter, ...(cursor ? { cursor } : {}) })
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

      allRows = allRows.concat(rows)
      nextCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
      cursor = nextCursor
      pagesCount++
    } while (cursor && pagesCount < PAGES_PER_CALL)

    res.status(200).json({ rows: allRows, nextPageInfo: nextCursor })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
