import { shopifyGraphQL } from '../../../lib/shopify.js'
import { resolveCategory } from '../../../lib/marketing-categories.js'

// Writes to a Page's metafields + assigns the shared "clp" template — same
// pattern as brand-hub-push-live.js (Pages, create-or-update, same
// metafield-based approach since Liquid can't make outbound calls for
// real collection titles/photos). CLPs have 5 tile-grid sections instead
// of Brand Hub's 2, resolved here the same way.
const TEMPLATE_SUFFIX = 'clp'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const {
    handle, confirmHandle, pageTitle, metaDescription, topic, h1, intro, trustSignals,
    browseAllLabel, browseAllUrl,
    mostViewedUrls, playerTypeUrls, brandUrls, modelUrls, featuredUrls,
    faqs, buyingGuideHeading, buyingGuideSections,
    clubhouseBody, clubhouseUrl, footerLinks,
  } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const found = await shopifyGraphQL(`
      query($q: String!) {
        pages(first: 1, query: $q) {
          nodes {
            id
            templateSuffix
            mf_topic: metafield(namespace: "custom", key: "seo_topic") { value }
            mf_h1: metafield(namespace: "custom", key: "seo_h1") { value }
            mf_intro: metafield(namespace: "custom", key: "seo_intro") { value }
            mf_trust: metafield(namespace: "custom", key: "seo_trust_signals") { value }
            mf_browse_label: metafield(namespace: "custom", key: "seo_browse_all_label") { value }
            mf_browse_url: metafield(namespace: "custom", key: "seo_browse_all_url") { value }
            mf_most_viewed: metafield(namespace: "custom", key: "seo_most_viewed") { value }
            mf_player_type: metafield(namespace: "custom", key: "seo_player_type") { value }
            mf_brand_tiles: metafield(namespace: "custom", key: "seo_brand_tiles") { value }
            mf_model_tiles: metafield(namespace: "custom", key: "seo_model_tiles") { value }
            mf_featured: metafield(namespace: "custom", key: "seo_featured_collections") { value }
            mf_faqs: metafield(namespace: "custom", key: "seo_faqs") { value }
            mf_guide_heading: metafield(namespace: "custom", key: "seo_buying_guide_heading") { value }
            mf_guide_sections: metafield(namespace: "custom", key: "seo_buying_guide_sections") { value }
            mf_clubhouse_body: metafield(namespace: "custom", key: "seo_clubhouse_body") { value }
            mf_clubhouse_url: metafield(namespace: "custom", key: "seo_clubhouse_url") { value }
            mf_footer_links: metafield(namespace: "custom", key: "seo_footer_links") { value }
            mf_description: metafield(namespace: "global", key: "description_tag") { value }
          }
        }
      }
    `, { q: `handle:${handle}` })
    const page = found.pages.nodes[0]

    const original = page ? {
      templateSuffix: page.templateSuffix || '',
      metafields: {
        seo_topic: page.mf_topic?.value || '',
        seo_h1: page.mf_h1?.value || '',
        seo_intro: page.mf_intro?.value || '',
        seo_trust_signals: page.mf_trust?.value || '',
        seo_browse_all_label: page.mf_browse_label?.value || '',
        seo_browse_all_url: page.mf_browse_url?.value || '',
        seo_most_viewed: page.mf_most_viewed?.value || '',
        seo_player_type: page.mf_player_type?.value || '',
        seo_brand_tiles: page.mf_brand_tiles?.value || '',
        seo_model_tiles: page.mf_model_tiles?.value || '',
        seo_featured_collections: page.mf_featured?.value || '',
        seo_faqs: page.mf_faqs?.value || '',
        seo_buying_guide_heading: page.mf_guide_heading?.value || '',
        seo_buying_guide_sections: page.mf_guide_sections?.value || '',
        seo_clubhouse_body: page.mf_clubhouse_body?.value || '',
        seo_clubhouse_url: page.mf_clubhouse_url?.value || '',
        seo_footer_links: page.mf_footer_links?.value || '',
        description_tag: page.mf_description?.value || '',
      },
    } : null

    // resolveCategory returns null for a link that could never be a real
    // collection (a search-results URL pasted in by mistake, e.g.
    // "driver?search=mini") — filtered out so it doesn't push live as a
    // broken, blank-image tile with the raw query string as its label.
    const [resolvedMostViewed, resolvedPlayerType, resolvedBrand, resolvedModel, resolvedFeatured] = (await Promise.all([
      Promise.all((mostViewedUrls || []).map(resolveCategory)),
      Promise.all((playerTypeUrls || []).map(resolveCategory)),
      Promise.all((brandUrls || []).map(resolveCategory)),
      Promise.all((modelUrls || []).map(resolveCategory)),
      Promise.all((featuredUrls || []).map(resolveCategory)),
    ])).map(list => list.filter(Boolean))

    const metafields = [
      { namespace: 'custom', key: 'seo_topic', type: 'single_line_text_field', value: topic || '' },
      { namespace: 'custom', key: 'seo_h1', type: 'single_line_text_field', value: h1 || '' },
      { namespace: 'custom', key: 'seo_intro', type: 'multi_line_text_field', value: intro || '' },
      { namespace: 'custom', key: 'seo_trust_signals', type: 'json', value: JSON.stringify(trustSignals || []) },
      { namespace: 'custom', key: 'seo_browse_all_label', type: 'single_line_text_field', value: browseAllLabel || '' },
      { namespace: 'custom', key: 'seo_browse_all_url', type: 'single_line_text_field', value: browseAllUrl || '' },
      { namespace: 'custom', key: 'seo_most_viewed', type: 'json', value: JSON.stringify(resolvedMostViewed) },
      { namespace: 'custom', key: 'seo_player_type', type: 'json', value: JSON.stringify(resolvedPlayerType) },
      { namespace: 'custom', key: 'seo_brand_tiles', type: 'json', value: JSON.stringify(resolvedBrand) },
      { namespace: 'custom', key: 'seo_model_tiles', type: 'json', value: JSON.stringify(resolvedModel) },
      { namespace: 'custom', key: 'seo_featured_collections', type: 'json', value: JSON.stringify(resolvedFeatured) },
      { namespace: 'custom', key: 'seo_faqs', type: 'json', value: JSON.stringify(faqs || []) },
      { namespace: 'custom', key: 'seo_buying_guide_heading', type: 'single_line_text_field', value: buyingGuideHeading || '' },
      { namespace: 'custom', key: 'seo_buying_guide_sections', type: 'json', value: JSON.stringify(buyingGuideSections || []) },
      { namespace: 'custom', key: 'seo_clubhouse_body', type: 'multi_line_text_field', value: clubhouseBody || '' },
      { namespace: 'custom', key: 'seo_clubhouse_url', type: 'single_line_text_field', value: clubhouseUrl || '' },
      { namespace: 'custom', key: 'seo_footer_links', type: 'json', value: JSON.stringify(footerLinks || []) },
      { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: metaDescription || '' },
    ]

    let resultPage
    if (page) {
      const update = await shopifyGraphQL(`
        mutation($id: ID!, $page: PageUpdateInput!) {
          pageUpdate(id: $id, page: $page) {
            page { id handle templateSuffix }
            userErrors { field message }
          }
        }
      `, { id: page.id, page: { title: pageTitle || undefined, templateSuffix: TEMPLATE_SUFFIX, metafields } })
      const errors = update.pageUpdate.userErrors
      if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))
      resultPage = update.pageUpdate.page
    } else {
      const create = await shopifyGraphQL(`
        mutation($page: PageCreateInput!) {
          pageCreate(page: $page) {
            page { id handle templateSuffix }
            userErrors { field message }
          }
        }
      `, { page: { title: pageTitle || h1 || handle, handle, templateSuffix: TEMPLATE_SUFFIX, isPublished: true, metafields } })
      const errors = create.pageCreate.userErrors
      if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))
      resultPage = create.pageCreate.page
    }

    return res.status(200).json({
      ok: true, original, created: !page,
      resolvedMostViewed, resolvedPlayerType, resolvedBrand, resolvedModel, resolvedFeatured,
      pageHandle: resultPage.handle,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
