// Pulls a real, live product/collection photo for a given collection handle.
// Uses the storefront's public JSON (no Shopify token needed) — same endpoint
// proven out against the Callaway/Odyssey page: collection image first,
// first product's photo as the fallback every collection has.
const STORE = 'www.golfclubs4cash.co.uk'

export default async function handler(req, res) {
  const { handle } = req.query
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const productsRes = await fetch(
      `https://${STORE}/collections/${encodeURIComponent(handle)}/products.json?limit=1`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!productsRes.ok) throw new Error(`Storefront responded ${productsRes.status}`)
    const data = await productsRes.json()
    const product = data.products?.[0]

    if (!product) {
      return res.status(404).json({ error: `No products found for collection "${handle}" — check the handle is correct and live` })
    }

    return res.status(200).json({
      handle,
      image: product.images?.[0]?.src || null,
      productTitle: product.title,
      productCount: null, // collections.json pagination is heavier — add if/when needed for the stale-count check
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
