import { uploadImageToShopify } from '../../../lib/shopify-files.js'

// Uploads a base64 reference image (pasted directly into a Google Doc) to
// Shopify Files, returning a real hosted CDN URL usable in article body HTML.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }
  const { dataUri, filename } = req.body
  if (!dataUri || !filename) return res.status(400).json({ error: 'dataUri and filename are required' })

  try {
    const url = await uploadImageToShopify(dataUri, filename)
    return res.status(200).json({ url })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
