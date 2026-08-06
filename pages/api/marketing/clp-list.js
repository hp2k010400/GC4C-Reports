import { shopifyGraphQL } from '../../../lib/shopify.js'

// Mirrors brand-hub-list.js.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  try {
    const data = await shopifyGraphQL(`
      query {
        pages(first: 250) {
          nodes {
            handle
            title
            updatedAt
            templateSuffix
            topic: metafield(namespace: "custom", key: "seo_topic") { value }
          }
        }
      }
    `)
    const items = data.pages.nodes
      .filter(p => p.templateSuffix === 'clp')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .map(p => ({ handle: p.handle, title: p.title, brandName: p.topic?.value || '', updatedAt: p.updatedAt }))
    return res.status(200).json({ items })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
