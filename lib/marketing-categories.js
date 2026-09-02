import { shopifyGraphQL } from './shopify.js'

// A search-results link (e.g. ".../collections/driver?search=mini", meant
// as a placeholder for a niche sub-category that doesn't have its own real
// collection yet) was never a link to one real collection in the first
// place — stripping its query string would just resolve it to the wrong,
// unrelated *general* collection ("driver") instead, silently substituting
// something the doc never actually asked for. Checked before the query
// string is stripped for the (legitimate, common) tracking-param case
// below, so a real "?ref=email" doesn't get flagged.
function isSearchResultsUrl(url) {
  return /[?&](search|q)=/i.test(url || '')
}

function handleFromUrl(url) {
  const path = (url || '').split('?')[0] // strip a trailing tracking param, e.g. "?ref=email"
  return path.split('/').filter(Boolean).pop() || ''
}

// Every "other brand hub" page handle on the real site is just the bare
// brand slug ("ping", "titleist", "cobra") — confirmed by checking the
// actual pages behind Murray's flagged mismatched pills. Real display
// casing for the ones that don't just title-case cleanly on their own.
const BRAND_DISPLAY_NAMES = {
  taylormade: 'TaylorMade', cleveland: 'Cleveland', titleist: 'Titleist',
  callaway: 'Callaway', ping: 'PING', mizuno: 'Mizuno', cobra: 'Cobra',
  srixon: 'Srixon', pxg: 'PXG', wilson: 'Wilson', xxio: 'XXIO',
  odyssey: 'Odyssey', 'scotty-cameron': 'Scotty Cameron', honma: 'Honma',
}

function brandLabelFromHandle(handle) {
  if (BRAND_DISPLAY_NAMES[handle]) return BRAND_DISPLAY_NAMES[handle]
  return handle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Returns null (filtered out by every caller) rather than a placeholder
// tile for a link that could never be a real collection — a search-results
// URL pasted in by mistake ("driver?search=mini"), same as it would for a
// genuinely empty url. A validly-named handle that simply doesn't have a
// real collection YET still gets its readable placeholder tile below —
// only an actually malformed/never-real link is dropped outright, so a
// bad doc link renders as nothing rather than an ugly raw-text tile with
// a blank image.
export async function resolveCategory(url) {
  if (isSearchResultsUrl(url)) return null
  const handle = handleFromUrl(url)
  if (!handle) return null
  try {
    const data = await shopifyGraphQL(`
      query($h: String!) {
        collectionByHandle(handle: $h) {
          id
          title
          products(first: 5, sortKey: BEST_SELLING) { nodes { featuredImage { url } } }
        }
      }
    `, { h: handle })
    const c = data.collectionByHandle
    if (!c) return { label: handle, handle, image: null, count: null }
    const productImage = c.products.nodes.find(p => p.featuredImage)?.featuredImage?.url

    // collectionByHandle's own productsCount includes every product ever
    // added to the collection, sold-out and archived alike (one real
    // collection came back at 28,589 — clearly not "currently available").
    // This scopes it to live, purchasable listings instead.
    const collectionId = c.id.split('/').pop()
    let count = null
    try {
      const countData = await shopifyGraphQL(`
        query($q: String!) { productsCount(query: $q) { count } }
      `, { q: `collection_id:${collectionId} AND status:active AND published_status:published` })
      count = countData.productsCount?.count ?? null
    } catch {
      // Count is a nice-to-have; the tile still works without it.
    }

    return {
      label: `Shop all ${c.title}`,
      handle,
      image: productImage || null,
      count,
    }
  } catch {
    return { label: handle, handle, image: null, count: null }
  }
}

// Best-guess image for a placeholder tile, purely for visual polish before
// real links exist. Searches Shopify collections by the name already written
// in the doc (e.g. "Ping", "Beginners") and returns an image if one matches —
// never a handle or URL, so it can never be mistaken for or turned into a
// real link. If nothing matches, the tile just falls back to a plain box.
export async function resolveLabelImage(label) {
  const clean = (label || '').trim()
  if (!clean) return null
  try {
    const data = await shopifyGraphQL(`
      query($q: String!) {
        collections(first: 1, query: $q, sortKey: RELEVANCE) {
          nodes { image { url } }
        }
      }
    `, { q: `title:*${clean}*` })
    return data.collections.nodes[0]?.image?.url || null
  } catch {
    return null
  }
}

// Resolves a link to another Brand Hub page. Murray's own flagged bug: this
// used to just echo back whatever the target page's raw Shopify title
// happened to be — fine for a real Brand Hub page, but a mess for the ~half
// of the ~16 brands that don't have a real Brand Hub page built yet, whose
// link still points at whatever placeholder exists today (an old CLP, a
// "Golf Clubs" category page, or nothing at all) — each with its own
// inconsistent title ("Titleist CLP", "PING Golf Clubs") blended in among
// pills that are supposed to all read the same way.
// Every one of these page handles is just the bare brand slug in practice
// (confirmed against the real pages behind Murray's flagged pills), so the
// label is always derived from the HANDLE itself — "brand name only", per
// Murray's ask — completely independent of whatever page (if any) actually
// sits there today. seo_brand_name (the metafield every real Brand Hub page
// carries) is preferred when the target IS a genuine Brand Hub page, since
// it's the authoritative source, but the handle-derived name is just as
// clean a fallback for every other case. The warning field still flags
// when the link doesn't point to a real Brand Hub page yet, so the person
// pushing knows a placeholder link is still live, even though the label is
// now clean regardless.
export async function resolvePageLink(url) {
  const handle = handleFromUrl(url)
  const cleanLabel = brandLabelFromHandle(handle)
  try {
    const data = await shopifyGraphQL(`
      query($q: String!) {
        pages(first: 1, query: $q) {
          nodes {
            title
            templateSuffix
            mf_brand: metafield(namespace: "custom", key: "seo_brand_name") { value }
          }
        }
      }
    `, { q: `handle:${handle}` })
    const p = data.pages.nodes[0]
    const isRealBrandHub = p?.templateSuffix === 'brand-hub' && !!p?.mf_brand?.value
    return {
      label: isRealBrandHub ? p.mf_brand.value : cleanLabel,
      handle,
      warning: !isRealBrandHub
        ? (p ? `Not a Brand Hub page yet (uses "${p.templateSuffix || 'no template'}") — links here until the real one exists` : 'No page exists yet at this handle')
        : null,
    }
  } catch {
    return { label: cleanLabel, handle, warning: null }
  }
}

// FAQ "CTA LINK -" lines are usually a shorthand instruction, not literal
// button text or a real URL — "PXG DRIVERS", "CALLAWAY IRONS", "MODELS".
// The old client-side resolver only recognised a handful of fixed patterns
// (condition guide, delivery, "brand hub") and left everything else blank —
// safe (no more broken self-links, fixed separately), but most real FAQ
// CTAs across every brand hub pushed so far went nowhere at all rather
// than to Murray's actual intended page. Runs server-side (needs the
// Admin API), re-resolving every FAQ at push time regardless of whatever
// the client-side preview already attempted.
export async function resolveFaqCtaUrl(rawLabel, { guidesUrl } = {}) {
  // Recognizes an already-resolved relative link ("/collections/pxg",
  // "#popular-models") too, not just an absolute URL — this function's
  // own output is always relative, never "https://...", so without this a
  // second push handed one of its own prior results back as ctaText would
  // treat it as an unresolved label and run a pointless (and likely
  // fruitless) fresh collection search instead of just reusing it.
  const urlMatch = (rawLabel || '').match(/^(https?:\/\/\S+|\/\S+|#\S+)/)
  if (urlMatch) return urlMatch[0]
  const l = (rawLabel || '').toLowerCase()
  if (l.includes('condition')) return '/pages/condition-rating-guide'
  if (l.includes('bag') || l.includes('blog')) return guidesUrl || ''
  if (l.includes('delivery')) return '/pages/delivery'
  if (l.includes('sell')) return '/pages/how-to-sell'
  // "MODELS" / "SPECIFIC MODELS" never names a real collection on its own —
  // the page's own "Popular {brand} models" tile grid further down IS the
  // real answer to "which models", so this links there instead of nowhere.
  if (l.includes('model')) return '#popular-models'
  if (l.includes('brand hub')) return '/collections/all'

  // Everything else ("PXG DRIVERS", "CALLAWAY IRONS", "PXG CLUBS") is
  // almost always a real collection, just described in shorthand.
  // Two real problems verified directly against live data before trusting
  // this, not assumed:
  // 1. Shopify's own RELEVANCE sort isn't even stable/complete enough to
  //    trust the top few results — "PXG Irons" itself didn't appear
  //    anywhere in the first 8 results for a "PXG IRONS" query on one
  //    request, yet did on an earlier one. first: 30 instead of a small
  //    page fixed it in every case tested.
  // 2. A plain "most words overlap" score alone still isn't enough: for
  //    "TITLEIST IRONS" it tied "Second Hand Titleist Irons For Sale"
  //    (the real, general answer) against "Titleist 2021 T-Series Irons"
  //    (a specific sub-line) at the same score, and a shortest-title
  //    tiebreak picked the sub-line — wrong the other way. Counting only
  //    genuinely UNEXPLAINED extra words (ignoring common marketplace
  //    filler like "second hand"/"for sale"/"used") as the tiebreak
  //    correctly favours the general collection instead, verified against
  //    real PXG, Callaway and Titleist data.
  const FILLER_WORDS = new Set(['second', 'hand', 'for', 'sale', 'used', 'shop', 'all', 'buy', 'golf'])
  const clean = (rawLabel || '').replace(/^link(\s+to)?\s+/i, '').trim()
  if (!clean) return ''
  try {
    const data = await shopifyGraphQL(`
      query($q: String!) {
        collections(first: 30, query: $q, sortKey: RELEVANCE) {
          nodes { title handle }
        }
      }
    `, { q: `title:*${clean}*` })
    const nodes = data.collections.nodes || []
    const exact = nodes.find(c => c.title.toLowerCase() === clean.toLowerCase())
    if (exact) return `/collections/${exact.handle}`

    const queryWords = clean.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    let best = null, bestScore = 0, bestExtra = Infinity
    for (const c of nodes) {
      const titleLower = c.title.toLowerCase()
      const score = queryWords.filter(w => titleLower.includes(w)).length
      const titleWords = titleLower.replace(/-/g, ' ').split(/\s+/).filter(Boolean)
      const extra = titleWords.filter(w => !queryWords.includes(w) && !FILLER_WORDS.has(w) && w.length > 1).length
      if (score > bestScore || (score === bestScore && extra < bestExtra)) {
        best = c; bestScore = score; bestExtra = extra
      }
    }
    return best ? `/collections/${best.handle}` : ''
  } catch {
    return ''
  }
}
