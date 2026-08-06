import { shopifyGraphQL } from './shopify.js'

// Resolves a real product photo for a blog section discussing a specific
// model (e.g. "The 2-Ball", "The Spider") — searches products by title
// match and returns the first real result's photo. No match just means no
// image for that section, never a guessed/wrong one.
export async function resolveProductImage(query) {
  // Strip a trailing ": subtitle" or " — subtitle", but NOT a plain hyphen —
  // that's often part of the product name itself (e.g. "2-Ball", "T-Series").
  // Also drops a leading "The " — real product titles don't carry it, and
  // it only dilutes the match.
  const clean = (query || '').replace(/[:—–].*$/, '').replace(/^The\s+/i, '').trim()
  if (!clean) return null
  try {
    const data = await shopifyGraphQL(`
      query($q: String!) {
        products(first: 1, query: $q, sortKey: RELEVANCE) {
          nodes { title featuredImage { url } }
        }
      }
    `, { q: `title:*${clean}*` })
    return data.products.nodes[0]?.featuredImage?.url || null
  } catch {
    return null
  }
}
