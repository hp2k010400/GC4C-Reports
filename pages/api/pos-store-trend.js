import { shopifyGraphQL } from '../../lib/shopify.js'

export default async function handler(req, res) {
  const { from, to } = req.query
  if (!from || !to) return res.status(400).json({ error: 'from and to required' })

  const days = (new Date(to) - new Date(from)) / 86400000
  const grain = days > 60 ? 'week' : 'day'

  const query = `FROM sales SHOW total_sales WHERE is_pos_sale = true GROUP BY pos_location_name, ${grain} SINCE ${from} UNTIL ${to} LIMIT 5000`

  try {
    const data = await shopifyGraphQL(`{
      shopifyqlQuery(query: ${JSON.stringify(query)}) {
        tableData { rows }
        parseErrors
      }
    }`)

    if (data.shopifyqlQuery?.parseErrors?.length) {
      console.error('pos-store-trend parseErrors:', JSON.stringify(data.shopifyqlQuery.parseErrors))
    }

    const tableData = data.shopifyqlQuery?.tableData
    if (!tableData?.rows) return res.json({ data: [], grain })

    const rows = Array.isArray(tableData.rows) ? tableData.rows : JSON.parse(tableData.rows)

    const byDate = {}
    for (const row of rows) {
      const date = row[grain]
      const store = row.pos_location_name
      if (!date || !store) continue
      if (!byDate[date]) byDate[date] = { date }
      byDate[date][store] = parseFloat(row.total_sales || 0)
    }

    const chartData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
    res.json({ data: chartData, grain })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
