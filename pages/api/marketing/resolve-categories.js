import { resolveCategory, resolvePageLink } from '../../../lib/marketing-categories.js'

// Read-only lookup used by the in-app preview — no writes to Shopify at all.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { mainCategoryUrls, otherCategoryUrls, otherBrandHubUrls } = req.body
  try {
    const [main, other, otherBrandHubs] = await Promise.all([
      Promise.all((mainCategoryUrls || []).map(resolveCategory)),
      Promise.all((otherCategoryUrls || []).map(resolveCategory)),
      Promise.all((otherBrandHubUrls || []).map(resolvePageLink)),
    ])
    // resolveCategory returns null for a link that could never be a real
    // collection (a search-results URL pasted in by mistake) — filtered out
    // here so it renders as nothing instead of a broken, blank-image tile.
    return res.status(200).json({ main: main.filter(Boolean), other: other.filter(Boolean), otherBrandHubs })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
