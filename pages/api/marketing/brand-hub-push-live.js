import { shopifyGraphQL } from '../../../lib/shopify.js'

// Writes to a Page's metafields + assigns the shared "brand-hub" template
// (built once, reused for all ~16 brands). Category tiles come in as plain
// collection URLs (GA4-ordered) — label, image and count are all resolved
// here from the live public storefront JSON at push time, since Liquid
// can't make outbound calls and the doc doesn't give handles+labels together.
const TEMPLATE_SUFFIX = 'brand-hub'
const STORE_DOMAIN = 'www.golfclubs4cash.co.uk'

function handleFromUrl(url) {
  return (url || '').split('/').filter(Boolean).pop() || ''
}

async function resolveCategory(url) {
  const handle = handleFromUrl(url)
  try {
    const [productsRes, collectionsRes] = await Promise.all([
      fetch(`https://${STORE_DOMAIN}/collections/${encodeURIComponent(handle)}/products.json?limit=1`, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
      fetch(`https://${STORE_DOMAIN}/collections.json?limit=250`, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
    ])
    const productsData = await productsRes.json()
    const product = productsData.products?.[0]
    let title = product ? `Shop all ${product.vendor} ${product.product_type}s` : handle
    let count = null
    try {
      const collectionsData = await collectionsRes.json()
      const match = collectionsData.collections?.find(c => c.handle === handle)
      if (match) {
        title = `Shop all ${match.title}`
        count = match.products_count
      }
    } catch { /* fall back to product-derived title */ }
    return { label: title, handle, image: product?.images?.[0]?.src || null, count }
  } catch {
    return { label: handle, handle, image: null, count: null }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const {
    handle, brandName, pageTitle, metaDescription, h1, heroParagraphs,
    whyBrandHeading, whyBrandParagraphs, mainCategoryUrls, otherCategoryUrls,
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
            mf_hero: metafield(namespace: "custom", key: "seo_hero_paragraphs") { value }
            mf_why_h: metafield(namespace: "custom", key: "seo_why_brand_heading") { value }
            mf_why_p: metafield(namespace: "custom", key: "seo_why_brand_paragraphs") { value }
            mf_main_cats: metafield(namespace: "custom", key: "seo_main_categories") { value }
            mf_other_cats: metafield(namespace: "custom", key: "seo_other_categories") { value }
            mf_faqs: metafield(namespace: "custom", key: "seo_faqs") { value }
            mf_tradein: metafield(namespace: "custom", key: "seo_tradein_paragraphs") { value }
            mf_guides_url: metafield(namespace: "custom", key: "seo_guides_url") { value }
            mf_guides_body: metafield(namespace: "custom", key: "seo_guides_body") { value }
          }
        }
      }
    `, { q: `handle:${handle}` })
    const page = found.pages.nodes[0]
    if (!page) throw new Error(`No page found for handle "${handle}"`)

    const original = {
      templateSuffix: page.templateSuffix || '',
      metafields: {
        seo_brand_name: page.mf_brand?.value || '',
        seo_h1: page.mf_h1?.value || '',
        seo_hero_paragraphs: page.mf_hero?.value || '',
        seo_why_brand_heading: page.mf_why_h?.value || '',
        seo_why_brand_paragraphs: page.mf_why_p?.value || '',
        seo_main_categories: page.mf_main_cats?.value || '',
        seo_other_categories: page.mf_other_cats?.value || '',
        seo_faqs: page.mf_faqs?.value || '',
        seo_tradein_paragraphs: page.mf_tradein?.value || '',
        seo_guides_url: page.mf_guides_url?.value || '',
        seo_guides_body: page.mf_guides_body?.value || '',
      },
    }

    const [resolvedMain, resolvedOther] = await Promise.all([
      Promise.all((mainCategoryUrls || []).map(resolveCategory)),
      Promise.all((otherCategoryUrls || []).map(resolveCategory)),
    ])

    const update = await shopifyGraphQL(`
      mutation($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id handle templateSuffix }
          userErrors { field message }
        }
      }
    `, {
      id: page.id,
      page: {
        title: pageTitle || undefined,
        templateSuffix: TEMPLATE_SUFFIX,
        metafields: [
          { namespace: 'custom', key: 'seo_brand_name', type: 'single_line_text_field', value: brandName || '' },
          { namespace: 'custom', key: 'seo_h1', type: 'single_line_text_field', value: h1 || '' },
          { namespace: 'custom', key: 'seo_hero_paragraphs', type: 'json', value: JSON.stringify(heroParagraphs || []) },
          { namespace: 'custom', key: 'seo_why_brand_heading', type: 'single_line_text_field', value: whyBrandHeading || '' },
          { namespace: 'custom', key: 'seo_why_brand_paragraphs', type: 'json', value: JSON.stringify(whyBrandParagraphs || []) },
          { namespace: 'custom', key: 'seo_main_categories', type: 'json', value: JSON.stringify(resolvedMain) },
          { namespace: 'custom', key: 'seo_other_categories', type: 'json', value: JSON.stringify(resolvedOther) },
          { namespace: 'custom', key: 'seo_faqs', type: 'json', value: JSON.stringify(faqs || []) },
          { namespace: 'custom', key: 'seo_tradein_paragraphs', type: 'json', value: JSON.stringify(tradeInParagraphs || []) },
          { namespace: 'custom', key: 'seo_guides_url', type: 'single_line_text_field', value: guidesUrl || '' },
          { namespace: 'custom', key: 'seo_guides_body', type: 'multi_line_text_field', value: guidesBody || '' },
        ],
      },
    })

    const errors = update.pageUpdate.userErrors
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))

    // seo / meta description on Pages goes through SEO fields, not part of PageUpdateInput's basic fields in this API version —
    // set title (done above); meta description isn't natively supported the same way as Collection.seo, so it's tracked here for reference only.

    return res.status(200).json({ ok: true, original, resolvedMain, resolvedOther })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
