import { shopifyGraphQL } from '../../../lib/shopify.js'
import { resolveCategory, resolvePageLink, resolveFaqCtaUrl } from '../../../lib/marketing-categories.js'

// Writes to a Page's metafields + assigns the shared "brand-hub" template
// (built once, reused for all ~16 brands). Category tiles come in as plain
// collection URLs (GA4-ordered) — label and image are resolved here via the
// authenticated Admin API at push time (real title, real product photo),
// since Liquid can't make outbound calls.
const TEMPLATE_SUFFIX = 'brand-hub'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const {
    handle, confirmHandle, brandName, pageTitle, metaDescription, h1, heroImage, heroParagraphs,
    whyBrandHeading, whyBrandParagraphs, mainCategoryUrls, otherCategoryUrls, otherBrandHubUrls,
    faqs, tradeInParagraphs, guidesUrl, guidesBody,
  } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const found = await shopifyGraphQL(`
      query($q: String!) {
        pages(first: 1, query: $q) {
          nodes {
            id
            templateSuffix
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

    const original = page ? {
      templateSuffix: page.templateSuffix || '',
      metafields: {
        seo_brand_name: page.mf_brand?.value || '',
        seo_h1: page.mf_h1?.value || '',
        seo_hero_image: page.mf_hero_image?.value || '',
        seo_hero_paragraphs: page.mf_hero?.value || '',
        seo_why_brand_heading: page.mf_why_h?.value || '',
        seo_why_brand_paragraphs: page.mf_why_p?.value || '',
        seo_main_categories: page.mf_main_cats?.value || '',
        seo_other_categories: page.mf_other_cats?.value || '',
        seo_other_brand_hubs: page.mf_other_hubs?.value || '',
        seo_faqs: page.mf_faqs?.value || '',
        seo_tradein_paragraphs: page.mf_tradein?.value || '',
        seo_guides_url: page.mf_guides_url?.value || '',
        seo_guides_body: page.mf_guides_body?.value || '',
        description_tag: page.mf_description?.value || '',
      },
    } : null

    // resolveCategory returns null for a link that could never be a real
    // collection (a search-results URL pasted in by mistake) — filtered out
    // so it doesn't push live as a broken, blank-image tile.
    const [resolvedMain, resolvedOther, resolvedOtherHubs, resolvedFaqs] = await Promise.all([
      Promise.all((mainCategoryUrls || []).map(resolveCategory)).then(list => list.filter(Boolean)),
      Promise.all((otherCategoryUrls || []).map(resolveCategory)).then(list => list.filter(Boolean)),
      Promise.all((otherBrandHubUrls || []).map(resolvePageLink)),
      // The client-side parse only recognises a handful of fixed CTA-label
      // patterns and leaves everything else blank ("PXG DRIVERS", "MODELS",
      // "CALLAWAY IRONS" — real shorthand for a real collection, not literal
      // button text). Re-resolved here with the full version, which can
      // actually search live collections — ctaText still carries the raw
      // label whenever it isn't already a literal URL (the one case
      // ctaUrl is trusted as-is, since there's no better label to work from).
      Promise.all((faqs || []).map(async f => ({
        ...f,
        ctaUrl: f.ctaText ? await resolveFaqCtaUrl(f.ctaText, { guidesUrl }) : (f.ctaUrl || ''),
      }))),
    ])

    const metafields = [
      { namespace: 'custom', key: 'seo_brand_name', type: 'single_line_text_field', value: brandName || '' },
      { namespace: 'custom', key: 'seo_h1', type: 'single_line_text_field', value: h1 || '' },
      { namespace: 'custom', key: 'seo_hero_image', type: 'single_line_text_field', value: heroImage || '' },
      { namespace: 'custom', key: 'seo_hero_paragraphs', type: 'json', value: JSON.stringify(heroParagraphs || []) },
      { namespace: 'custom', key: 'seo_why_brand_heading', type: 'single_line_text_field', value: whyBrandHeading || '' },
      { namespace: 'custom', key: 'seo_why_brand_paragraphs', type: 'json', value: JSON.stringify(whyBrandParagraphs || []) },
      { namespace: 'custom', key: 'seo_main_categories', type: 'json', value: JSON.stringify(resolvedMain) },
      { namespace: 'custom', key: 'seo_other_categories', type: 'json', value: JSON.stringify(resolvedOther) },
      { namespace: 'custom', key: 'seo_other_brand_hubs', type: 'json', value: JSON.stringify(resolvedOtherHubs) },
      { namespace: 'custom', key: 'seo_faqs', type: 'json', value: JSON.stringify(resolvedFaqs) },
      { namespace: 'custom', key: 'seo_tradein_paragraphs', type: 'json', value: JSON.stringify(tradeInParagraphs || []) },
      { namespace: 'custom', key: 'seo_guides_url', type: 'single_line_text_field', value: guidesUrl || '' },
      { namespace: 'custom', key: 'seo_guides_body', type: 'multi_line_text_field', value: guidesBody || '' },
      // Pages have no native "seo" input field like Collections do — the theme
      // actually reads the meta description from this metafield convention instead.
      // Confirmed by writing a test value and checking it render in <meta name="description">.
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
      `, {
        id: page.id,
        page: { title: pageTitle || undefined, templateSuffix: TEMPLATE_SUFFIX, metafields },
      })
      const errors = update.pageUpdate.userErrors
      if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))
      resultPage = update.pageUpdate.page
    } else {
      // Roughly half the ~16 brand hub pages don't exist yet as real Shopify
      // pages — create it fresh rather than requiring it to be made by hand
      // in Admin first.
      const create = await shopifyGraphQL(`
        mutation($page: PageCreateInput!) {
          pageCreate(page: $page) {
            page { id handle templateSuffix }
            userErrors { field message }
          }
        }
      `, {
        page: { title: pageTitle || h1 || handle, handle, templateSuffix: TEMPLATE_SUFFIX, isPublished: true, metafields },
      })
      const errors = create.pageCreate.userErrors
      if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))
      resultPage = create.pageCreate.page
    }

    return res.status(200).json({ ok: true, original, created: !page, resolvedMain, resolvedOther, resolvedOtherHubs, pageHandle: resultPage.handle })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
