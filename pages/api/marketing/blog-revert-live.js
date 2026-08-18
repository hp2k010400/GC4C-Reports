import { shopifyGraphQL } from '../../../lib/shopify.js'

// If the article existed before the push, restores its exact prior fields.
// If push-live had to create it fresh (brand-new blog post), there's no
// "before" state to restore to — this deletes it instead, which is the
// correct undo for something that didn't exist a moment ago.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { handle, original, created } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const found = await shopifyGraphQL(`
      query($q: String!) { articles(first: 1, query: $q) { nodes { id } } }
    `, { q: `handle:${handle}` })
    const articleId = found.articles.nodes[0]?.id
    if (!articleId) throw new Error(`No article found for handle "${handle}"`)

    if (created) {
      const del = await shopifyGraphQL(`
        mutation($id: ID!) { articleDelete(id: $id) { deletedArticleId userErrors { field message } } }
      `, { id: articleId })
      const errors = del.articleDelete.userErrors
      if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))
      return res.status(200).json({ ok: true, deleted: true })
    }

    if (!original) return res.status(400).json({ error: 'original content is required to restore it' })

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
        title: original.title,
        body: original.body,
        summary: original.summary,
        tags: original.tags || [],
        templateSuffix: original.templateSuffix || '',
        image: original.image || null,
        author: original.author ? { name: original.author } : undefined,
        metafields: [
          { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: original.description_tag || '' },
          { namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: original.title_tag || '' },
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
