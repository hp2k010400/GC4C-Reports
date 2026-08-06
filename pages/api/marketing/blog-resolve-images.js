import { resolveProductImage } from '../../../lib/marketing-products.js'

// Read-only lookup used by the in-app preview — no writes to Shopify at all.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }
  const { queries } = req.body
  try {
    const images = await Promise.all((queries || []).map(resolveProductImage))
    return res.status(200).json({ images })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
