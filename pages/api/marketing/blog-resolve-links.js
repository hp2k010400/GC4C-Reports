import { autoLinkBrandMentions } from '../../../lib/marketing-brand-links.js'

// Read-only lookup used by the in-app preview — no writes to Shopify at
// all. Mirrors what blog-push-live.js does for real on push, so the
// preview shows the same brand links the live article will actually get.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }
  const { introParagraphs, sections } = req.body
  try {
    const brandLinkState = [new Set(), new Map()]
    const linkedIntro = await autoLinkBrandMentions(introParagraphs || [], ...brandLinkState)
    const linkedSections = []
    for (const s of (sections || [])) {
      linkedSections.push(await autoLinkBrandMentions(s || [], ...brandLinkState))
    }
    return res.status(200).json({ introParagraphs: linkedIntro, sections: linkedSections })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
