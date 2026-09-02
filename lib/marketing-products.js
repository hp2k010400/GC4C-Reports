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

// The same failure as the numbered-heading bug above, just without a
// leading number to catch it: "The feel" (a section about how a putter's
// face feels off the strike, from a Scotty Cameron piece) cleans down to
// the single word "feel" — which is also a genuine substring of "Srixon
// Soft Feel" golf balls, so the word-overlap safety check waves it
// through as a real match. "The price"/"Nick Price" was the same coincidence
// one heading earlier. A short comparison/"how to spot a fake" article's
// section headings are consistently either a real product/model name
// ("The 2-Ball", "The Spider", "Newport 2") or a bare abstract quality
// ("Feel", "Price", "Weight", "Sound") — never both — so a heading that
// cleans down to ONE of these known quality words, and nothing else, is
// treated the same as a numbered heading: no sensible product search to
// run at all, not a word-overlap gamble.
const ABSTRACT_QUALITY_WORDS = new Set([
  'feel', 'price', 'weight', 'sound', 'finish', 'quality', 'value',
  'forgiveness', 'alignment', 'stability', 'sole', 'warranty', 'durability',
  'comfort', 'fitting', 'performance', 'spin', 'roll', 'control',
  'workability', 'consistency', 'aesthetics', 'looks', 'verdict',
  'conclusion', 'summary', 'milling', 'stamping', 'accuracy', 'distance',
  'balance', 'sensitivity', 'responsiveness', 'craftsmanship',
])

// A doc heading's own parenthetical, e.g. "The case for a mallet (Phantom)",
// is the actual specific model/product-line name — real live bug, traced to
// source: mashing it into the full cleaned sentence as one long literal
// wildcard query ("case for a mallet Phantom") returned nothing usable from
// Shopify's search (confirmed directly), while the bare parenthetical word
// alone ("Phantom") resolves the real product correctly every time. Used as
// the query on its own, ahead of the full-sentence cleanup below, whenever
// one exists.
function extractParenthetical(query) {
  const m = (query || '').match(/\(([^)]+)\)/)
  return m ? m[1].trim() : ''
}

export async function resolveProductImage(query) {
  if (/^\d+\.\s/.test((query || '').trim())) return null

  const paren = extractParenthetical(query)
  // Strip a trailing ": subtitle" or " — subtitle", but NOT a plain hyphen —
  // that's often part of the product name itself (e.g. "2-Ball", "T-Series").
  // Also drops a leading "The " — real product titles never carry it.
  const clean = paren || (query || '')
    .replace(/[:—–].*$/, '')
    .replace(/^The\s+/i, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return null
  if (!paren && ABSTRACT_QUALITY_WORDS.has(clean.toLowerCase())) return null
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

// Same query/matching as resolveProductImage, but returns up to `count`
// distinct real photos instead of just the first — for filling in
// several sections that share one fallback hint (a numbered checklist
// guide's "Images: product images" instruction with a single "Featured
// image: scotty cameron putter" hint). Reusing ONE resolved photo across
// every such section reads as broken, not correct, once it's the exact
// same picture repeated under five different headings — a real pool of
// different genuine products fixes that without reintroducing the
// per-heading guessing that caused the wrong-image bugs in the first
// place (every photo here still comes from the same one safe, doc-
// approved query, just not the same single result every time).
export async function resolveProductImagePool(query, count = 6) {
  if (/^\d+\.\s/.test((query || '').trim())) return []
  const paren = extractParenthetical(query)
  const clean = paren || (query || '')
    .replace(/[:—–].*$/, '')
    .replace(/^The\s+/i, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return []
  if (!paren && ABSTRACT_QUALITY_WORDS.has(clean.toLowerCase())) return []
  try {
    const data = await shopifyGraphQL(`
      query($q: String!) {
        products(first: 20, query: $q, sortKey: RELEVANCE) {
          nodes { title featuredImage { url } }
        }
      }
    `, { q: `title:*${clean}*` })
    const queryWords = clean.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w))
    const seenUrl = new Set()
    const seenModel = new Set()
    const urls = []
    for (const p of (data.products.nodes || [])) {
      const titleLower = p.title.toLowerCase()
      if (!queryWords.some(w => titleLower.includes(w))) continue
      // A "putter" search also matches "Putter Cover" (a headcover, not a
      // putter) — verified directly against the real catalog, where this
      // was putting an accessory photo in the same pool as real putters.
      if (/\bcover\b/i.test(p.title)) continue
      const url = p.featuredImage?.url
      if (!url || seenUrl.has(url)) continue
      // Different length/spec variants of the exact same model ("...LTD
      // Putter / 35 Inch" vs "/ 34 Inch") are near-identical studio
      // photos of the same putter — real different URLs, but visually
      // the same picture to a reader. One representative per base model
      // (strip the trailing "/ 35 Inch" etc. and a leading "Left Hand").
      const model = p.title.split('/')[0].replace(/^Left Hand\s+/i, '').trim().toLowerCase()
      if (seenModel.has(model)) continue
      seenUrl.add(url)
      seenModel.add(model)
      urls.push(url)
      if (urls.length >= count) break
    }
    return urls
  } catch {
    return []
  }
}
