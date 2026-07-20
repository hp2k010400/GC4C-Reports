import { shopifyGraphQL } from '../../lib/shopify.js'

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const data = await shopifyGraphQL(`{
      shopifyqlQuery(query: "FROM sales SHOW pos_location_name, gross_sales, discounts, sales_reversals, net_sales, taxes, total_sales WHERE is_pos_sale = true SINCE 2026-07-13 UNTIL 2026-07-19") {
        tableData {
          columns { name displayName dataType }
          rows
        }
        parseErrors
      }
    }`)
    res.json({ ok: true, data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
