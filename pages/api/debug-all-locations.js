// TEMPORARY diagnostic — shows ALL locations including inactive ones, to check
// whether inventoryLevels(first: 5) in stock-value could be truncating.
// Remove after use.
import { shopifyGetOne } from '../../lib/shopify.js'

export default async function handler(req, res) {
  try {
    const data = await shopifyGetOne('locations.json', { limit: 250 })
    res.status(200).json({ count: (data.locations || []).length, locations: data.locations })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
