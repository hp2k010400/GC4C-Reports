import { shopifyGraphQL } from '../../../lib/shopify.js'

// Writes to a Page's metafields + assigns the shared "brand-hub" template
// (built once, reused for all ~16 brands). Category tile images/counts are
// resolved here from the live public storefront JSON at push time (Liquid
// can't make outbound calls), then baked into the metafield as JSON.
const TEMPLATE_SUFFIX = 'brand-hub'
const STORE_DOMAIN = 'www.golfclubs4cash.co.uk'

async function resolveCategory(label, handle) {
  try {
    const res = await fetch(`https://${STORE_DOMAIN}/collections/${encodeURIComponent(handle)}/products.json?limit=1`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    const data = await res.json()
    const product = data.products?.[0]
    return { label, handle, image: product?.images?.[0]?.src || null, count: null }
  } catch {
    return { label, handle, image: null, count: null }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const {
    handle, brandName, heroHeading, heroBody, heroCtaText, heroCtaUrl, heroImage,
    whyHeading, whyBody, categories, faqs,
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
            mf_hero_h: metafield(namespace: "custom", key: "seo_hero_heading") { value }
            mf_hero_b: metafield(namespace: "custom", key: "seo_hero_body") { value }
            mf_hero_cta_t: metafield(namespace: "custom", key: "seo_hero_cta_text") { value }
            mf_hero_cta_u: metafield(namespace: "custom", key: "seo_hero_cta_url") { value }
            mf_hero_img: metafield(namespace: "custom", key: "seo_hero_image") { value }
            mf_why_h: metafield(namespace: "custom", key: "seo_why_heading") { value }
            mf_why_b: metafield(namespace: "custom", key: "seo_why_body") { value }
            mf_categories: metafield(namespace: "custom", key: "seo_categories") { value }
            mf_faqs: metafield(namespace: "custom", key: "seo_faqs") { value }
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
        seo_hero_heading: page.mf_hero_h?.value || '',
        seo_hero_body: page.mf_hero_b?.value || '',
        seo_hero_cta_text: page.mf_hero_cta_t?.value || '',
        seo_hero_cta_url: page.mf_hero_cta_u?.value || '',
        seo_hero_image: page.mf_hero_img?.value || '',
        seo_why_heading: page.mf_why_h?.value || '',
        seo_why_body: page.mf_why_b?.value || '',
        seo_categories: page.mf_categories?.value || '',
        seo_faqs: page.mf_faqs?.value || '',
      },
    }

    const resolvedCategories = await Promise.all(
      (categories || []).map(c => resolveCategory(c.label, c.handle))
    )

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
        templateSuffix: TEMPLATE_SUFFIX,
        metafields: [
          { namespace: 'custom', key: 'seo_brand_name', type: 'single_line_text_field', value: brandName || '' },
          { namespace: 'custom', key: 'seo_hero_heading', type: 'single_line_text_field', value: heroHeading || '' },
          { namespace: 'custom', key: 'seo_hero_body', type: 'multi_line_text_field', value: heroBody || '' },
          { namespace: 'custom', key: 'seo_hero_cta_text', type: 'single_line_text_field', value: heroCtaText || '' },
          { namespace: 'custom', key: 'seo_hero_cta_url', type: 'single_line_text_field', value: heroCtaUrl || '' },
          { namespace: 'custom', key: 'seo_hero_image', type: 'single_line_text_field', value: heroImage || '' },
          { namespace: 'custom', key: 'seo_why_heading', type: 'single_line_text_field', value: whyHeading || '' },
          { namespace: 'custom', key: 'seo_why_body', type: 'multi_line_text_field', value: whyBody || '' },
          { namespace: 'custom', key: 'seo_categories', type: 'json', value: JSON.stringify(resolvedCategories) },
          { namespace: 'custom', key: 'seo_faqs', type: 'json', value: JSON.stringify(faqs || []) },
        ],
      },
    })

    const errors = update.pageUpdate.userErrors
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))

    return res.status(200).json({ ok: true, original, resolvedCategories })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
