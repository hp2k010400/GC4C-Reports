import { shopifyGraphQL } from '../../../lib/shopify.js'

// Lightweight get/set for just the article title and meta description,
// same pattern as brand-hub-seo.js.
export default async function handler(req, res) {
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  if (req.method === 'GET') {
    const { handle } = req.query
    if (!handle) return res.status(400).json({ error: 'handle is required' })
    try {
      const data = await shopifyGraphQL(`
        query($q: String!) {
          articles(first: 1, query: $q) {
            nodes {
              title
              mf: metafield(namespace: "global", key: "description_tag") { value }
            }
          }
        }
      `, { q: `handle:${handle}` })
      const article = data.articles.nodes[0]
      if (!article) throw new Error(`No article found for handle "${handle}"`)
      return res.status(200).json({ title: article.title, metaDescription: article.mf?.value || '' })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method === 'POST') {
    const { handle, title, metaDescription } = req.body
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
      `, {
        id: articleId,
        article: {
          title: title || undefined,
          metafields: [
            { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: metaDescription || '' },
          ],
        },
      })
      const errors = update.articleUpdate.userErrors
      if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))
      return res.status(200).json({ ok: true })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'GET or POST only' })
}
