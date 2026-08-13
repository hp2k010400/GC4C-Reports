// Extracts real <table> data from a Google Doc's HTML export — the plain-
// text export renders every cell as its own line, tab-prefixed except the
// first cell in the whole table, with no other structural marker, so
// column count can't be reliably reconstructed from plain text alone.
// Real <table>/<tr>/<td> markup gives exact rows and columns directly.
export function extractDocTables(html) {
  const tables = []
  for (const tableMatch of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    const rows = []
    for (const rowMatch of tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = []
      for (const cellMatch of rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)) {
        const text = cellMatch[1]
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        cells.push(text.replace(/\s+/g, ' ').trim())
      }
      if (cells.length) rows.push(cells)
    }
    if (rows.length) tables.push(rows)
  }
  return tables
}
