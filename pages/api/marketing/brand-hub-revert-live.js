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
      query($q: String!) {
        pages(first: 1, query: $q) { nodes { id } }
      }
    `, { q: `handle:${handle}` })
    const pageId = found.pages.nodes[0]?.id
    if (!pageId) throw new Error(`No page found for handle "${handle}"`)

    const mf = original.metafields || {}
    const update = await shopifyGraphQL(`
      mutation($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id handle }
          userErrors { field message }
        }
      }
    `, {
      id: pageId,
      page: {
        templateSuffix: original.templateSuffix || '',
        metafields: [
          { namespace: 'custom', key: 'seo_brand_name', type: 'single_line_text_field', value: mf.seo_brand_name || '' },
          { namespace: 'custom', key: 'seo_h1', type: 'single_line_text_field', value: mf.seo_h1 || '' },
          { namespace: 'custom', key: 'seo_hero_paragraphs', type: 'json', value: mf.seo_hero_paragraphs || '[]' },
          { namespace: 'custom', key: 'seo_why_brand_heading', type: 'single_line_text_field', value: mf.seo_why_brand_heading || '' },
          { namespace: 'custom', key: 'seo_why_brand_paragraphs', type: 'json', value: mf.seo_why_brand_paragraphs || '[]' },
          { namespace: 'custom', key: 'seo_main_categories', type: 'json', value: mf.seo_main_categories || '[]' },
          { namespace: 'custom', key: 'seo_other_categories', type: 'json', value: mf.seo_other_categories || '[]' },
          { namespace: 'custom', key: 'seo_faqs', type: 'json', value: mf.seo_faqs || '[]' },
          { namespace: 'custom', key: 'seo_tradein_paragraphs', type: 'json', value: mf.seo_tradein_paragraphs || '[]' },
          { namespace: 'custom', key: 'seo_guides_url', type: 'single_line_text_field', value: mf.seo_guides_url || '' },
          { namespace: 'custom', key: 'seo_guides_body', type: 'multi_line_text_field', value: mf.seo_guides_body || '' },
          { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: mf.description_tag || '' },
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
