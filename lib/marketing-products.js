import { shopifyGraphQL } from './shopify.js'

// Resolves a real product photo for a blog section discussing a specific
// model (e.g. "The 2-Ball", "The Spider") — searches products by title
// match and returns the first real result's photo. No match just means no
// image for that section, never a guessed/wrong one.
export async function resolveProductImage(query) {
  const clean = (query || '').replace(/[:—–-].*$/, '').trim() // "The 2-Ball: the original..." -> "The 2-Ball"
  if (!clean) return null
  try {
    const data = await shopifyGraphQL(`
      query($q: String!) {
        products(first: 1, query: $q, sortKey: BEST_SELLING) {
          nodes { title featuredImage { url } }
        }
      }
    `, { q: `title:*${clean}*` })
    return data.products.nodes[0]?.featuredImage?.url || null
  } catch {
    return null
  }
}
