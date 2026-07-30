import { shopifyGraphQL } from '../../../lib/shopify.js'

// Lightweight get/set for just the page title (search engine title) and
// meta description — the two fields Murray asked to edit directly from the
// "done so far" list without needing a full doc re-push. Doesn't touch any
// of the brand-hub content metafields at all.
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
          pages(first: 1, query: $q) {
            nodes {
              title
              mf: metafield(namespace: "global", key: "description_tag") { value }
            }
          }
        }
      `, { q: `handle:${handle}` })
      const page = data.pages.nodes[0]
      if (!page) throw new Error(`No page found for handle "${handle}"`)
      return res.status(200).json({ title: page.title, metaDescription: page.mf?.value || '' })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method === 'POST') {
    const { handle, title, metaDescription } = req.body
    if (!handle) return res.status(400).json({ error: 'handle is required' })
    try {
      const found = await shopifyGraphQL(`
        query($q: String!) { pages(first: 1, query: $q) { nodes { id } } }
      `, { q: `handle:${handle}` })
      const pageId = found.pages.nodes[0]?.id
      if (!pageId) throw new Error(`No page found for handle "${handle}"`)

      const update = await shopifyGraphQL(`
        mutation($id: ID!, $page: PageUpdateInput!) {
          pageUpdate(id: $id, page: $page) {
            page { id }
            userErrors { field message }
          }
        }
      `, {
        id: pageId,
        page: {
          title: title || undefined,
          metafields: [
            { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: metaDescription || '' },
          ],
        },
      })
      const errors = update.pageUpdate.userErrors
      if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))
      return res.status(200).json({ ok: true })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'GET or POST only' })
}
