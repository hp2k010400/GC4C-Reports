import { shopifyGraphQL } from '../../../lib/shopify.js'

// Paginates through every article across every blog (cheap fields only)
// and filters to ones using our brand-blog template — mirrors
// brand-hub-list.js/model-collection-list.js.
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
          articles(first: 250, after: $cursor) {
            pageInfo { hasNextPage }
            edges {
              cursor
              node {
                handle
                title
                updatedAt
                templateSuffix
                blog { handle }
              }
            }
          }
        }
      `, { cursor })
      const edges = data.articles.edges
      for (const { node } of edges) {
        if (node.templateSuffix === 'brand-blog') {
          items.push({
            handle: node.handle,
            title: node.title,
            updatedAt: node.updatedAt,
            blogHandle: node.blog.handle,
            viewUrl: `https://www.golfclubs4cash.co.uk/blogs/${node.blog.handle}/${node.handle}`,
          })
        }
      }
      hasNext = data.articles.pageInfo.hasNextPage
      cursor = edges.length ? edges[edges.length - 1].cursor : null
      if (!edges.length) break
    }
    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    return res.status(200).json({ items })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
