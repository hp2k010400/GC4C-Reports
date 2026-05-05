const STORE = process.env.SHOPIFY_STORE
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const API = '2025-04'

const UPDATABLE = {
  'Price': 'price',
  'Compare At Price': 'compare_at_price',
  'SKU': 'sku',
  'Barcode': 'barcode',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!TOKEN) return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })

  const { rows } = req.body
  if (!rows?.length) return res.status(400).json({ error: 'No rows provided' })

  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const variantId = row['Variant ID']
    if (!variantId) { skipped++; continue }

    const variantData = {}
    for (const [csvCol, apiField] of Object.entries(UPDATABLE)) {
      if (row[csvCol] !== undefined && row[csvCol] !== '') {
        variantData[apiField] = row[csvCol]
      }
    }

    if (!Object.keys(variantData).length) { skipped++; continue }

    const updateRes = await fetch(
      `https://${STORE}/admin/api/${API}/variants/${variantId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ variant: { id: variantId, ...variantData } }),
      }
    )

    if (updateRes.ok) updated++
    else skipped++
  }

  res.json({ updated, skipped })
}
