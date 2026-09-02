import { shopifyGraphQL } from '../../../lib/shopify.js'

// Reads a real, already-pushed Brand Hub page's metafields back out and
// returns them as structured data — the read half of round-trip editing.
// The metafields store RESOLVED data (seo_main_categories is
// [{label, handle, image, count}, ...], not the original doc URLs) since
// that's what the theme section actually renders — the original collection
// URL isn't preserved verbatim, but it's fully reconstructable from each
// item's own `handle` (a real collection URL is just
// /collections/<handle>), so nothing is actually lost for re-editing.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }
  const { handle } = req.query
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const found = await shopifyGraphQL(`
      query($q: String!) {
        pages(first: 1, query: $q) {
          nodes {
            title
            mf_brand: metafield(namespace: "custom", key: "seo_brand_name") { value }
            mf_h1: metafield(namespace: "custom", key: "seo_h1") { value }
            mf_hero_image: metafield(namespace: "custom", key: "seo_hero_image") { value }
            mf_hero: metafield(namespace: "custom", key: "seo_hero_paragraphs") { value }
            mf_why_h: metafield(namespace: "custom", key: "seo_why_brand_heading") { value }
            mf_why_p: metafield(namespace: "custom", key: "seo_why_brand_paragraphs") { value }
            mf_main_cats: metafield(namespace: "custom", key: "seo_main_categories") { value }
            mf_other_cats: metafield(namespace: "custom", key: "seo_other_categories") { value }
            mf_other_hubs: metafield(namespace: "custom", key: "seo_other_brand_hubs") { value }
            mf_faqs: metafield(namespace: "custom", key: "seo_faqs") { value }
            mf_tradein: metafield(namespace: "custom", key: "seo_tradein_paragraphs") { value }
            mf_guides_url: metafield(namespace: "custom", key: "seo_guides_url") { value }
            mf_guides_body: metafield(namespace: "custom", key: "seo_guides_body") { value }
            mf_description: metafield(namespace: "global", key: "description_tag") { value }
          }
        }
      }
    `, { q: `handle:${handle}` })
    const page = found.pages.nodes[0]
    if (!page) return res.status(404).json({ error: `No page found for handle "${handle}"` })

    const parseJson = (mf, fallback) => {
      if (!mf?.value) return fallback
      try { return JSON.parse(mf.value) } catch { return fallback }
    }

    return res.status(200).json({
      pageTitle: page.title || '',
      metaDescription: page.mf_description?.value || '',
      brandName: page.mf_brand?.value || '',
      h1: page.mf_h1?.value || '',
      heroImage: page.mf_hero_image?.value || '',
      heroParagraphs: parseJson(page.mf_hero, []),
      whyBrandHeading: page.mf_why_h?.value || '',
      whyBrandParagraphs: parseJson(page.mf_why_p, []),
      mainCategories: parseJson(page.mf_main_cats, []),
      otherCategories: parseJson(page.mf_other_cats, []),
      otherBrandHubs: parseJson(page.mf_other_hubs, []),
      faqs: parseJson(page.mf_faqs, []),
      tradeInParagraphs: parseJson(page.mf_tradein, []),
      guidesUrl: page.mf_guides_url?.value || '',
      guidesBody: page.mf_guides_body?.value || '',
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
