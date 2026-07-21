import { shopifyGraphQL } from '../../lib/shopify.js'

const STORE_ORDER = ['Edinburgh', 'Milton Keynes', 'Southampton', 'Warrington']

async function fetchPOSData(since, until) {
  const query = `FROM sales SHOW gross_sales, discounts, net_sales, shipping_charges, taxes, total_sales, gross_margin WHERE is_pos_sale = true GROUP BY pos_location_name WITH TOTALS SINCE ${since} UNTIL ${until} ORDER BY total_sales DESC LIMIT 1000`
  const data = await shopifyGraphQL(`{
    shopifyqlQuery(query: ${JSON.stringify(query)}) {
      tableData {
        columns { name }
        rows
      }
      parseErrors
    }
  }`)
  const tableData = data.shopifyqlQuery?.tableData
  if (!tableData?.rows) return null
  const rows = Array.isArray(tableData.rows) ? tableData.rows : JSON.parse(tableData.rows)

  const stores = {}
  for (const row of rows) {
    const name = row.pos_location_name
    if (!name) continue
    stores[name] = {
      name,
      grossSales:  parseFloat(row.gross_sales  || 0),
      discounts:   parseFloat(row.discounts    || 0),
      netSales:    parseFloat(row.net_sales    || 0),
      taxes:       parseFloat(row.taxes        || 0),
      totalSales:  parseFloat(row.total_sales  || 0),
      grossMargin: parseFloat(row.gross_margin || 0),
    }
  }
  return { stores }
}

export default async function handler(req, res) {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from and to required' })

  try {
    const [current, ly] = await Promise.all([
      fetchPOSData(from, to),
      fetchPOSData(
        new Date(new Date(from).getTime() - 364 * 86400000).toISOString().slice(0, 10),
        new Date(new Date(to).getTime()   - 364 * 86400000).toISOString().slice(0, 10),
      ),
    ])

    if (!current) return res.json({ stores: [] })

    const stores = STORE_ORDER
      .map(name => ({ ...current.stores[name], name, totalSalesLY: ly?.stores[name]?.totalSales || 0 }))
      .filter(s => s.totalSales > 0)

    res.json({ stores })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
