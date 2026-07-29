import { shopifyGraphQL } from '../../../lib/shopify.js'

// Removes a collection from the Model Collection list by clearing its
// template back to the theme default (grid/filters/Fast Simon untouched —
// this only ever affected templateSuffix, never the underlying collection).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { handle } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const found = await shopifyGraphQL(`
      query($handle: String!) { collectionByHandle(handle: $handle) { id } }
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
    `, { input: { id: collectionId, templateSuffix: '' } })

    const errors = update.collectionUpdate.userErrors
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
