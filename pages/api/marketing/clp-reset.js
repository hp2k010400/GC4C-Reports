import { shopifyGraphQL } from '../../../lib/shopify.js'

// Mirrors brand-hub-reset.js.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { handle } = req.body
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
    `, { id: pageId, page: { templateSuffix: '' } })
    const errors = update.pageUpdate.userErrors
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
