const STORE = process.env.SHOPIFY_STORE
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const API = '2025-04'

const VARIANT_FIELDS = {
  'Price':            'price',
  'Compare At Price': 'compare_at_price',
  'SKU':              'sku',
  'Barcode':          'barcode',
}

const PRODUCT_FIELDS = {
  'Title':  'title',
  'Brand':  'vendor',
  'Type':   'product_type',
  'Status': 'status',
  'Tags':   'tags',
}

async function shopifyPut(path, body) {
  const res = await fetch(`https://${STORE}/admin/api/${API}/${path}`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!TOKEN) return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured' })

  const { rows } = req.body
  if (!rows?.length) return res.status(400).json({ error: 'No rows provided' })

  let updated = 0
  let skipped = 0

  // Deduplicate product-level updates — one PUT per product, not per variant row
  const productUpdates = new Map()
  for (const row of rows) {
    const productId = row['Product ID']
    if (!productId) continue
    const data = {}
    for (const [col, field] of Object.entries(PRODUCT_FIELDS)) {
      if (row[col] !== undefined && row[col] !== '') data[field] = row[col]
    }
    if (Object.keys(data).length) productUpdates.set(String(productId), data)
  }

  for (const [productId, data] of productUpdates) {
    const ok = await shopifyPut(`products/${productId}.json`, { product: { id: productId, ...data } })
    if (ok) updated++; else skipped++
  }

  // Variant-level updates
  for (const row of rows) {
    const variantId = row['Variant ID']
    if (!variantId) { skipped++; continue }

    const data = {}
    for (const [col, field] of Object.entries(VARIANT_FIELDS)) {
      if (row[col] !== undefined && row[col] !== '') data[field] = row[col]
    }

    if (!Object.keys(data).length) { skipped++; continue }

    const ok = await shopifyPut(`variants/${variantId}.json`, { variant: { id: variantId, ...data } })
    if (ok) updated++; else skipped++
  }

  res.json({ updated, skipped })
}
