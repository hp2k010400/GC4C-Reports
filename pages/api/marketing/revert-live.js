import { shopifyGraphQL } from '../../../lib/shopify.js'

// Clears templateSuffix so the collection instantly falls back to its normal
// template. Leaves the metafields and theme files in place — harmless, since
// nothing references them once the template assignment is gone.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { handle } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })

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
          collection { id handle templateSuffix }
          userErrors { field message }
        }
      }
    `, { input: { id: collectionId, templateSuffix: '' } })

    const errors = update.collectionUpdate.userErrors
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))

    return res.status(200).json({ ok: true, collection: update.collectionUpdate.collection })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
