import { shopifyGraphQL } from '../../../lib/shopify.js'

// Pages don't support filtering by template_suffix in Shopify's search
// syntax, so this pulls all pages (135 on this store — comfortably one
// page of results) and filters client-side.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  try {
    const data = await shopifyGraphQL(`
      query {
        pages(first: 250) {
          nodes {
            handle
            title
            updatedAt
            templateSuffix
            brandName: metafield(namespace: "custom", key: "seo_brand_name") { value }
          }
        }
      }
    `)
    const items = data.pages.nodes
      .filter(p => p.templateSuffix === 'brand-hub')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .map(p => ({
        handle: p.handle,
        title: p.title,
        brandName: p.brandName?.value || '',
        updatedAt: p.updatedAt,
      }))
    return res.status(200).json({ items })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
