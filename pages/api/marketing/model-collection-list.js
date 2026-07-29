import { shopifyGraphQL } from '../../../lib/shopify.js'

// Collections don't support filtering by template_suffix in Shopify's search
// syntax either, and there are 1000+ collections on this store — too many
// to fetch in one page. Paginates through all of them (title/handle/
// templateSuffix only, so each page is cheap) and filters client-side.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  try {
    const items = []
    let cursor = null
    let hasNext = true
    while (hasNext) {
      const data = await shopifyGraphQL(`
        query($cursor: String) {
          collections(first: 250, after: $cursor) {
            pageInfo { hasNextPage }
            edges {
              cursor
              node {
                handle
                title
                updatedAt
                templateSuffix
              }
            }
          }
        }
      `, { cursor })
      const edges = data.collections.edges
      for (const { node } of edges) {
        if (node.templateSuffix === 'model-page') {
          items.push({ handle: node.handle, title: node.title, updatedAt: node.updatedAt })
        }
      }
      hasNext = data.collections.pageInfo.hasNextPage
      cursor = edges.length ? edges[edges.length - 1].cursor : null
      if (!edges.length) break
    }
    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    return res.status(200).json({ items })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
