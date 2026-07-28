import { shopifyGraphQL } from '../../../lib/shopify.js'

// Restores the exact description/SEO fields push-live handed back before
// it overwrote them — a true undo, not just a blank.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { handle, original } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })
  if (!original) return res.status(400).json({ error: 'original content is required to restore it' })

  try {
    const found = await shopifyGraphQL(`
      query($handle: String!) {
        collectionByHandle(handle: $handle) { id }
      }
    `, { handle })
    const collectionId = found.collectionByHandle?.id
    if (!collectionId) throw new Error(`No collection found for handle "${handle}"`)

    const update = await shopifyGraphQL(`
      mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id handle }
          userErrors { field message }
        }
      }
    `, {
      input: {
        id: collectionId,
        descriptionHtml: original.descriptionHtml,
        seo: { title: original.seoTitle || undefined, description: original.seoDescription || undefined },
      },
    })

    const errors = update.collectionUpdate.userErrors
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
