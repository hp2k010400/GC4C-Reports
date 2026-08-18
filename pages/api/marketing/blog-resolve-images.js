import { resolveProductImage, resolveProductImagePool } from '../../../lib/marketing-products.js'

// Read-only lookup used by the in-app preview — no writes to Shopify at all.
// poolQuery/poolCount: optional — when a doc needs several DIFFERENT real
// photos for the same one hint (numbered checklist sections all falling
// back to "Featured image: scotty cameron putter"), a single resolved
// image reused everywhere reads as broken once it's the exact same
// picture under five different headings. Mirrors what blog-push-live.js
// does for real on push, so the preview matches.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }
  const { queries, poolQuery, poolCount } = req.body
  try {
    const images = await Promise.all((queries || []).map(resolveProductImage))
    const pool = poolQuery ? await resolveProductImagePool(poolQuery, poolCount || 6) : []
    return res.status(200).json({ images, pool })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
