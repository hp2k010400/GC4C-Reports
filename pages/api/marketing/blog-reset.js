import { shopifyGraphQL } from '../../../lib/shopify.js'

// Removes an article from the tracking list by clearing its template back
// to the theme default (article content/title untouched — only the design
// it renders with changes).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { handle } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const found = await shopifyGraphQL(`
      query($q: String!) { articles(first: 1, query: $q) { nodes { id } } }
    `, { q: `handle:${handle}` })
    const articleId = found.articles.nodes[0]?.id
    if (!articleId) throw new Error(`No article found for handle "${handle}"`)

    const update = await shopifyGraphQL(`
      mutation($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article { id }
          userErrors { field message }
        }
      }
    `, { id: articleId, article: { templateSuffix: '' } })
    const errors = update.articleUpdate.userErrors
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
