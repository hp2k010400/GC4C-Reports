import { resolveCategory } from '../../../lib/marketing-categories.js'

// Read-only lookup used by the in-app preview — no writes to Shopify at all.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { mainCategoryUrls, otherCategoryUrls } = req.body
  try {
    const [main, other] = await Promise.all([
      Promise.all((mainCategoryUrls || []).map(resolveCategory)),
      Promise.all((otherCategoryUrls || []).map(resolveCategory)),
    ])
    return res.status(200).json({ main, other })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
