import { shopifyGraphQL } from '../../../lib/shopify.js'

// Read-only lookup used right before Push Live to tell the confirm dialog
// whether this will UPDATE a real existing page or CREATE a brand new one.
// Exists specifically to catch a handle typo/mismatch before it happens —
// Shopify doesn't error on a colliding handle at create time, it silently
// appends "-1" and creates an orphaned duplicate instead of updating the
// page you actually meant to.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }
  const { handle } = req.query
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const data = await shopifyGraphQL(`
      query($q: String!) {
        pages(first: 1, query: $q) {
          nodes { title templateSuffix updatedAt }
        }
      }
    `, { q: `handle:${handle}` })
    const page = data.pages.nodes[0]
    return res.status(200).json({
      exists: !!page,
      title: page?.title || null,
      templateSuffix: page?.templateSuffix || null,
      updatedAt: page?.updatedAt || null,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
