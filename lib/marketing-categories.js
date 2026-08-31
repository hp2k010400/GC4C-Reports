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
