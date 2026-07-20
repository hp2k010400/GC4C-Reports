import { shopifyGraphQL } from '../../lib/shopify.js'

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const data = await shopifyGraphQL(`{
      __type(name: "ShopifyqlTableData") {
        fields { name type { name kind ofType { name kind } } }
      }
    }`)
    res.json({ ok: true, data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
