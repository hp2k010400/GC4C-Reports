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

// Resolves a link to another Brand Hub page — just needs the real page
// title, since these render as simple link pills, not image tiles.
export async function resolvePageLink(url) {
  const handle = handleFromUrl(url)
  try {
    const data = await shopifyGraphQL(`
      query($q: String!) {
        pages(first: 1, query: $q) { nodes { title } }
      }
    `, { q: `handle:${handle}` })
    const p = data.pages.nodes[0]
    return { label: p?.title || handle, handle }
  } catch {
    return { label: handle, handle }
  }
}
