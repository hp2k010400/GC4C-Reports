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
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'to', 'and', 'or', 'for', 'is', 'are', 'your', 'you', 'it', 'its'])

export async function resolveProductImage(query) {
  // Strip a trailing ": subtitle" or " — subtitle", but NOT a plain hyphen —
  // that's often part of the product name itself (e.g. "2-Ball", "T-Series").
  // Also drops a leading "The " and a leading numbered-list marker ("3. ") —
  // real product titles never carry either, and left in, the numbered form
  // is what broke the search query outright.
  const clean = (query || '')
    .replace(/[:—–].*$/, '')
    .replace(/^\d+\.\s*/, '')
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
