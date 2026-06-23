import { shopifyGetOne } from '../../lib/shopify.js'

const BATCH = 20 // 20 items × up to 12 locations = 240 results, safely under Shopify's 250 limit

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { ids } = req.body || {}
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' })

  try {
    const batches = []
    for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH))

    const results = await Promise.all(
      batches.map(batch =>
        shopifyGetOne('inventory_levels.json', { inventory_item_ids: batch.join(','), limit: 250 })
          .then(d => d.inventory_levels || [])
          .catch(() => [])
      )
    )

    res.status(200).json({ levels: results.flat() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
