import { shopifyGraphQL } from '../../lib/shopify.js'

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const typeName = req.query.type || 'ReturnLineItemType'
  const data = await shopifyGraphQL(`
    {
      __type(name: "${typeName}") {
        name
        fields {
          name
          type { name kind ofType { name kind } }
        }
      }
    }
  `)
  res.json(data)
}
