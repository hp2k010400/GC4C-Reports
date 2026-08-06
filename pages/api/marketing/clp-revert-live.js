import { shopifyGraphQL } from '../../../lib/shopify.js'

// Mirrors brand-hub-revert-live.js.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { handle, original, created } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const found = await shopifyGraphQL(`
      query($q: String!) { pages(first: 1, query: $q) { nodes { id } } }
    `, { q: `handle:${handle}` })
    const pageId = found.pages.nodes[0]?.id
    if (!pageId) throw new Error(`No page found for handle "${handle}"`)

    if (created) {
      const del = await shopifyGraphQL(`
        mutation($id: ID!) { pageDelete(id: $id) { deletedPageId userErrors { field message } } }
      `, { id: pageId })
      const errors = del.pageDelete.userErrors
      if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))
      return res.status(200).json({ ok: true, deleted: true })
    }

    if (!original) return res.status(400).json({ error: 'original content is required to restore it' })
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
          { namespace: 'custom', key: 'seo_topic', type: 'single_line_text_field', value: mf.seo_topic || '' },
          { namespace: 'custom', key: 'seo_h1', type: 'single_line_text_field', value: mf.seo_h1 || '' },
          { namespace: 'custom', key: 'seo_intro', type: 'multi_line_text_field', value: mf.seo_intro || '' },
          { namespace: 'custom', key: 'seo_trust_signals', type: 'json', value: mf.seo_trust_signals || '[]' },
          { namespace: 'custom', key: 'seo_browse_all_label', type: 'single_line_text_field', value: mf.seo_browse_all_label || '' },
          { namespace: 'custom', key: 'seo_browse_all_url', type: 'single_line_text_field', value: mf.seo_browse_all_url || '' },
          { namespace: 'custom', key: 'seo_most_viewed', type: 'json', value: mf.seo_most_viewed || '[]' },
          { namespace: 'custom', key: 'seo_player_type', type: 'json', value: mf.seo_player_type || '[]' },
          { namespace: 'custom', key: 'seo_brand_tiles', type: 'json', value: mf.seo_brand_tiles || '[]' },
          { namespace: 'custom', key: 'seo_model_tiles', type: 'json', value: mf.seo_model_tiles || '[]' },
          { namespace: 'custom', key: 'seo_featured_collections', type: 'json', value: mf.seo_featured_collections || '[]' },
          { namespace: 'custom', key: 'seo_faqs', type: 'json', value: mf.seo_faqs || '[]' },
          { namespace: 'custom', key: 'seo_buying_guide_heading', type: 'single_line_text_field', value: mf.seo_buying_guide_heading || '' },
          { namespace: 'custom', key: 'seo_buying_guide_sections', type: 'json', value: mf.seo_buying_guide_sections || '[]' },
          { namespace: 'custom', key: 'seo_clubhouse_body', type: 'multi_line_text_field', value: mf.seo_clubhouse_body || '' },
          { namespace: 'custom', key: 'seo_clubhouse_url', type: 'single_line_text_field', value: mf.seo_clubhouse_url || '' },
          { namespace: 'custom', key: 'seo_footer_links', type: 'json', value: mf.seo_footer_links || '[]' },
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
