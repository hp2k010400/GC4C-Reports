import { shopifyGraphQL } from '../../../lib/shopify.js'

// Keep in sync with the SAFE_TEST_HANDLES lists in the template pages —
// the dedicated test page ends up with templateSuffix "brand-hub" too every
// time it's used for testing, so it must never appear here. It has no real
// content of its own to protect, but "Remove" here clears templateSuffix,
// which breaks whatever's currently being tested there for no reason.
const EXCLUDED_HANDLES = ['marketing-automation-test-page', 'marketing-automation-test']

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
      .filter(p => p.templateSuffix === 'brand-hub' && !EXCLUDED_HANDLES.includes(p.handle))
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
