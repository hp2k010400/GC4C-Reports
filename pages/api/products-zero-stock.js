import { fetchZeroStockPage, buildZeroStockFilter } from '../../lib/reports/zero-stock-products.js'

const PAGES_PER_CALL = 12

export default async function handler(req, res) {
  try {
    let cursor = req.query.page_info || null
    const filter = buildZeroStockFilter(req.query)

    let allRows = []
    let pagesCount = 0

    do {
      const { rows, nextCursor } = await fetchZeroStockPage(cursor, filter)
      allRows = allRows.concat(rows)
      cursor = nextCursor
      pagesCount++
    } while (cursor && pagesCount < PAGES_PER_CALL)

    res.status(200).json({ rows: allRows, nextPageInfo: cursor })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
