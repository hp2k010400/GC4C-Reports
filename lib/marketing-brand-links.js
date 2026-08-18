import { shopifyGraphQL } from './shopify.js'

// Some docs have real hyperlinks already embedded in the body text
// (extracted upstream via doc-links.js) — nothing to do here. Others
// instead carry an explicit instruction in the "Links:" field itself
// ("Link to any product specific models or any mention of brands etc,
// search results if n/a") with NO inline links at all in the body — the
// linking is meant to happen at page-build time, not already done in the
// doc. This resolves that: finds the first mention of each known brand
// across the whole article and links it to a real collection page, or a
// site search results page when no clean brand-level collection exists
// (e.g. Callaway only has narrow sub-collections like "Callaway Drivers",
// no single "Callaway" hub) — matching the doc's own fallback instruction
// literally.
//
// Deliberately a curated list, not a generic "any capitalised phrase"
// heuristic — the same class of doc that needs this (a numbered
// checklist/guide) is exactly the kind where a stray capitalised name
// (a golfer mentioned in passing, a place name) would otherwise get
// mistaken for a brand and linked somewhere irrelevant.
const BRANDS = [
  'Scotty Cameron', 'TaylorMade', 'Titleist', 'Callaway', 'PING', 'Cobra',
  'Mizuno', 'Cleveland', 'Odyssey', 'Bettinardi', 'PXG', 'Srixon', 'Wilson',
  'Honma', 'Miura', 'Vokey', 'XXIO', 'Bridgestone', 'Yonex', 'Tour Edge',
  'Adams', 'Ben Hogan', 'MacGregor',
]
// Longest first so "Scotty Cameron" is checked (and wins) before a
// shorter brand name that might otherwise match inside it.
const SORTED_BRANDS = [...BRANDS].sort((a, b) => b.length - a.length)

async function resolveBrandUrl(brand) {
  try {
    const data = await shopifyGraphQL(`
      query($q: String!) {
        collections(first: 5, query: $q, sortKey: RELEVANCE) {
          nodes { title handle }
        }
      }
    `, { q: `title:*${brand}*` })
    const words = brand.toLowerCase().split(/\s+/)
    // Every word of the brand name has to appear in the collection's own
    // title — same defensive bar as resolveProductImage, so "Callaway"
    // doesn't loosely match some unrelated collection that just happens
    // to share one word.
    const candidates = (data.collections.nodes || []).filter(c => {
      const t = c.title.toLowerCase()
      return words.every(w => t.includes(w))
    })
    if (!candidates.length) return `/search?q=${encodeURIComponent(brand)}`
    // Prefer the shortest matching title — "Titleist Golf Clubs" (the
    // brand hub) over "Titleist Vokey SM9 Design Wedge" (one narrow
    // product line) when both technically match.
    candidates.sort((a, b) => a.title.length - b.title.length)
    return `/collections/${candidates[0].handle}`
  } catch {
    return `/search?q=${encodeURIComponent(brand)}`
  }
}

// paragraphs: a mixed array (string prose | {table} markers, same shape
// buildBlogBodyHtml expects) — table markers pass through untouched.
// Returns a new array in the same shape, with the first mention of each
// recognised brand wrapped in a real <a href>.
//
// linked/urlCache: pass the SAME Set/Map back in across multiple calls
// (e.g. once for the intro, once per section) so "first mention in the
// whole article" is tracked article-wide, not reset to a fresh, empty
// set on every individual section — a caller processing section by
// section instead of the whole body at once would otherwise link the
// same brand again in every section that mentions it.
export async function autoLinkBrandMentions(paragraphs, linked = new Set(), urlCache = new Map()) {
  const result = []
  for (const p of paragraphs) {
    if (typeof p !== 'string') { result.push(p); continue }
    let text = p
    for (const brand of SORTED_BRANDS) {
      if (linked.has(brand)) continue
      const re = new RegExp('\\b' + brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      const m = text.match(re)
      if (!m) continue
      // Don't wrap text that's already inside a real <a> tag from the doc.
      const before = text.slice(0, m.index)
      const openTags = (before.match(/<a /g) || []).length
      const closeTags = (before.match(/<\/a>/g) || []).length
      if (openTags > closeTags) continue
      if (!urlCache.has(brand)) urlCache.set(brand, await resolveBrandUrl(brand))
      const url = urlCache.get(brand)
      text = text.slice(0, m.index) + `<a href="${url}">${m[0]}</a>` + text.slice(m.index + m[0].length)
      linked.add(brand)
    }
    result.push(text)
  }
  return result
}
