import { resolveLabelImage } from '../../../lib/marketing-categories.js'

// Read-only, image-only lookup used by the CLP preview's placeholder tiles
// (names the doc already has but with no real link yet). Never returns a
// handle or URL — just a best-guess image for visual polish. No Shopify writes.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { labels } = req.body
  if (!Array.isArray(labels)) return res.status(400).json({ error: 'labels must be an array' })

  try {
    const unique = [...new Set(labels.filter(Boolean))]
    const results = await Promise.all(unique.map(async (label) => [label, await resolveLabelImage(label)]))
    const images = Object.fromEntries(results)
    return res.status(200).json({ images })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
