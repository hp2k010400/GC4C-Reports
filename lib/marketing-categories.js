import { shopifyGraphQL } from './shopify.js'

function handleFromUrl(url) {
  return (url || '').split('/').filter(Boolean).pop() || ''
}

export async function resolveCategory(url) {
  const handle = handleFromUrl(url)
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
// happened to be — fine for a real Brand Hub page, but silent and wrong for
// a doc that accidentally links an old CLP or "Brand Focus" page instead,
// which shows up with its own inconsistent title ("Titleist BF") blended
// in among real "Brand Hub" pills with no indication anything's off.
// seo_brand_name is the metafield every REAL Brand Hub page carries (this
// tool writes it on every push) — using it instead of the raw title gives
// every genuine Brand Hub link the same clean "brand name only" label
// Murray asked for, and its absence (or a non-"brand-hub" templateSuffix)
// is the actual, reliable signal that the link points somewhere else —
// far more reliable than guessing from title text.
export async function resolvePageLink(url) {
  const handle = handleFromUrl(url)
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
      label: isRealBrandHub ? p.mf_brand.value : (p?.title || handle),
      handle,
      warning: p && !isRealBrandHub ? `Not a Brand Hub page (${p.templateSuffix ? `uses "${p.templateSuffix}"` : 'no template'}) — check this link in the doc` : null,
    }
  } catch {
    return { label: handle, handle, warning: null }
  }
}
