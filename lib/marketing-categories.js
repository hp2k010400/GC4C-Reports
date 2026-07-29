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
          title
          products(first: 5, sortKey: BEST_SELLING) { nodes { featuredImage { url } } }
        }
      }
    `, { h: handle })
    const c = data.collectionByHandle
    if (!c) return { label: handle, handle, image: null }
    const productImage = c.products.nodes.find(p => p.featuredImage)?.featuredImage?.url
    return {
      label: `Shop all ${c.title}`,
      handle,
      image: productImage || null,
    }
  } catch {
    return { label: handle, handle, image: null }
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
