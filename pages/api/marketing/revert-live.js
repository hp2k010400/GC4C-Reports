import { shopifyGraphQL } from '../../../lib/shopify.js'

// Restores the exact templateSuffix + metafield values push-live captured
// before it changed them — clears the template assignment back to whatever
// it was (usually none), so the page instantly reverts to its normal layout.
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

    const mf = original.metafields || {}
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
        templateSuffix: original.templateSuffix || '',
        metafields: [
          { namespace: 'custom', key: 'seo_intro', type: 'multi_line_text_field', value: mf.seo_intro || '' },
          { namespace: 'custom', key: 'seo_faqs', type: 'json', value: mf.seo_faqs || '[]' },
          { namespace: 'custom', key: 'seo_compare_brands', type: 'json', value: mf.seo_compare_brands || '[]' },
          { namespace: 'custom', key: 'seo_guides_url', type: 'single_line_text_field', value: mf.seo_guides_url || '' },
        ],
      },
    })

    const errors = update.collectionUpdate.userErrors
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
