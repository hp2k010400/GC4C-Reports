import { shopifyGraphQL } from '../../lib/shopify.js'

const QUERY = `
  query GetNewProductSkus($cursor: String) {
    products(first: 250, after: $cursor, query: "tag:'new product' status:active") {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          productType
          vendor
          variants(first: 100) {
            edges {
              node { sku }
            }
          }
        }
      }
    }
  }
`

export default async function handler(_req, res) {
  try {
    const skus = new Set()
    const meta = {} // sku -> { type, vendor }
    let cursor = null

    do {
      const data = await shopifyGraphQL(QUERY, { cursor })
      const products = data.products?.edges || []

      for (const { node: product } of products) {
        const type = product.productType || ''
        const vendor = product.vendor || ''
        for (const { node: variant } of (product.variants?.edges || [])) {
          if (variant.sku) {
            skus.add(variant.sku)
            meta[variant.sku] = { type, vendor }
          }
        }
      }

      const pageInfo = data.products?.pageInfo
      cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null
    } while (cursor)

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({ skus: [...skus], meta })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
