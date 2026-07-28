import { shopifyGraphQL } from '../../../lib/shopify.js'

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
        pageByHandle(handle: $handle) { id }
      }
    `, { handle })
    const pageId = found.pageByHandle?.id
    if (!pageId) throw new Error(`No page found for handle "${handle}"`)

    const mf = original.metafields || {}
    const update = await shopifyGraphQL(`
      mutation($input: PageInput!) {
        pageUpdate(input: $input) {
          page { id handle }
          userErrors { field message }
        }
      }
    `, {
      input: {
        id: pageId,
        templateSuffix: original.templateSuffix || '',
        metafields: [
          { namespace: 'custom', key: 'seo_brand_name', type: 'single_line_text_field', value: mf.seo_brand_name || '' },
          { namespace: 'custom', key: 'seo_hero_heading', type: 'single_line_text_field', value: mf.seo_hero_heading || '' },
          { namespace: 'custom', key: 'seo_hero_body', type: 'multi_line_text_field', value: mf.seo_hero_body || '' },
          { namespace: 'custom', key: 'seo_hero_cta_text', type: 'single_line_text_field', value: mf.seo_hero_cta_text || '' },
          { namespace: 'custom', key: 'seo_hero_cta_url', type: 'single_line_text_field', value: mf.seo_hero_cta_url || '' },
          { namespace: 'custom', key: 'seo_hero_image', type: 'single_line_text_field', value: mf.seo_hero_image || '' },
          { namespace: 'custom', key: 'seo_why_heading', type: 'single_line_text_field', value: mf.seo_why_heading || '' },
          { namespace: 'custom', key: 'seo_why_body', type: 'multi_line_text_field', value: mf.seo_why_body || '' },
          { namespace: 'custom', key: 'seo_categories', type: 'json', value: mf.seo_categories || '[]' },
          { namespace: 'custom', key: 'seo_faqs', type: 'json', value: mf.seo_faqs || '[]' },
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
