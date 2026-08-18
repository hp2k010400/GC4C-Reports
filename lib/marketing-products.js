import { shopifyGraphQL } from './shopify.js'

// Resolves a real product photo for a blog section discussing a specific
// model (e.g. "The 2-Ball", "The Spider") — searches products by title
// match and returns the first real result's photo. No match just means no
// image for that section, never a guessed/wrong one — that promise was
// being broken by a real bug: a numbered heading ("3. The serial number")
// went into Shopify's wildcard search almost as-is, the malformed filter
// silently failed to match anything, and Shopify's RELEVANCE sort fell
// back to ranking the ENTIRE catalog and handing back its top result — a
// Ping wedge, for a heading about checking a Scotty Cameron's serial
// number. Two fixes: strip a leading list number before it ever reaches
// the query, and require the result's own title to genuinely share a real
// word with the query before trusting it — Shopify returning *something*
// is not the same as it returning something relevant.
// A genuine keyword-overlap match still isn't safe on its own — "6. The
// price" (a checklist item about cost, from a "how to spot a fake"
// guide) legitimately shares the real word "price" with an unrelated
// "Nick Price" signature wedge, and there's no reliable way to tell that
// kind of coincidence apart from a real product-name match by word
// overlap alone. But a NUMBERED heading ("1. Weight", "3. The serial
// number", "6. The price") is never itself a real product name in any
// doc seen so far — those are checklist/guide items, not product
// spotlights (a doc actually about a product uses a plain heading like
// "The 2-Ball" or "The Spider") — so numbered headings skip the product
// search entirely rather than relying on word-overlap to save them.
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'to', 'and', 'or', 'for', 'is', 'are', 'your', 'you', 'it', 'its'])

export async function resolveProductImage(query) {
  if (/^\d+\.\s/.test((query || '').trim())) return null

  // Strip a trailing ": subtitle" or " — subtitle", but NOT a plain hyphen —
  // that's often part of the product name itself (e.g. "2-Ball", "T-Series").
  // Also drops a leading "The " — real product titles never carry it.
  const clean = (query || '')
    .replace(/[:—–].*$/, '')
    .replace(/^The\s+/i, '')
    .trim()
  if (!clean) return null
  try {
    const data = await shopifyGraphQL(`
      query($q: String!) {
        products(first: 5, query: $q, sortKey: RELEVANCE) {
          nodes { title featuredImage { url } }
        }
      }
    `, { q: `title:*${clean}*` })
    const queryWords = clean.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w))
    const match = (data.products.nodes || []).find(p => {
      const titleLower = p.title.toLowerCase()
      return queryWords.some(w => titleLower.includes(w))
    })
    return match?.featuredImage?.url || null
  } catch {
    return null
  }
}
