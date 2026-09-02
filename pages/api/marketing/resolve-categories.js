import { resolveCategory, resolvePageLink, resolveFaqCtaUrl } from '../../../lib/marketing-categories.js'

// Read-only lookup used by the in-app preview — no writes to Shopify at all.
// faqs/guidesUrl are optional — CLP doesn't have per-heading CTA labels to
// resolve the same way Brand Hub does, so it just won't send them.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { mainCategoryUrls, otherCategoryUrls, otherBrandHubUrls, faqs, guidesUrl } = req.body
  try {
    const [main, other, otherBrandHubs, resolvedFaqs] = await Promise.all([
      Promise.all((mainCategoryUrls || []).map(resolveCategory)),
      Promise.all((otherCategoryUrls || []).map(resolveCategory)),
      Promise.all((otherBrandHubUrls || []).map(resolvePageLink)),
      // Without this the preview only ever showed whatever the client-side
      // resolveCtaUrl's handful of fixed patterns could match on their own
      // (e.g. "sell") — everything resolvable only via a real live
      // collection search ("PXG DRIVERS", "SPECIFIC MODELS") silently
      // showed no link in preview, then showed up correctly only once
      // actually pushed. Mirrors the exact same re-resolution
      // brand-hub-push-live.js does for real, so what's previewed here
      // matches what a push will actually produce.
      Promise.all((faqs || []).map(async f => ({
        ...f,
        ctaUrl: f.ctaText ? await resolveFaqCtaUrl(f.ctaText, { guidesUrl }) : (f.ctaUrl || ''),
      }))),
    ])
    // resolveCategory returns null for a link that could never be a real
    // collection (a search-results URL pasted in by mistake) — filtered out
    // here so it renders as nothing instead of a broken, blank-image tile.
    return res.status(200).json({ main: main.filter(Boolean), other: other.filter(Boolean), otherBrandHubs, faqs: resolvedFaqs })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
