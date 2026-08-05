import { fetchStockValuePage, buildStockValueFilter } from '../../lib/reports/stock-value.js'

const PAGES_PER_CALL = 10

export default async function handler(req, res) {
  try {
    let cursor = req.query.page_info || null
    const filter = buildStockValueFilter()

    let allRows = []
    let pagesCount = 0

    do {
      const { rows, nextCursor } = await fetchStockValuePage(cursor, filter)
      allRows = allRows.concat(rows)
      cursor = nextCursor
      pagesCount++
    } while (cursor && pagesCount < PAGES_PER_CALL)

    res.status(200).json({ rows: allRows, nextPageInfo: cursor })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
