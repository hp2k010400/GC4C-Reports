import { shopifyGraphQL } from '../../lib/shopify.js'

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const data = await shopifyGraphQL(`{
      shopifyqlQuery(query: "FROM sales SHOW total_sales GROUPED BY pos_location_name WHERE is_pos_sale = true SINCE 2026-07-13 UNTIL 2026-07-19") {
        tableData {
          columns { name displayName dataType }
          rowData
        }
        parseErrors { code message }
      }
    }`)
    res.json({ ok: true, data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
