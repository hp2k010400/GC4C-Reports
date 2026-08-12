import { shopifyGraphQL } from '../../../lib/shopify.js'

// Article equivalent of check-page.js — see that file for why this exists.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }
  const { handle } = req.query
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const data = await shopifyGraphQL(`
      query($q: String!) {
        articles(first: 1, query: $q) {
          nodes { title templateSuffix updatedAt }
        }
      }
    `, { q: `handle:${handle}` })
    const article = data.articles.nodes[0]
    return res.status(200).json({
      exists: !!article,
      title: article?.title || null,
      templateSuffix: article?.templateSuffix || null,
      updatedAt: article?.updatedAt || null,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
