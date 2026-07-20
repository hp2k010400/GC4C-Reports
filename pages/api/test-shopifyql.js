import { shopifyGraphQL } from '../../lib/shopify.js'

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const data = await shopifyGraphQL(`{
      shopifyqlQuery(query: "FROM sales SHOW gross_sales, discounts, sales_reversals, net_sales, shipping_charges, taxes, total_sales WHERE is_pos_sale = true GROUP BY pos_location_name WITH TOTALS SINCE 2026-07-13 UNTIL 2026-07-19 ORDER BY total_sales DESC LIMIT 1000") {
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
