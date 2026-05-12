import { shopifyGetOne } from '../../lib/shopify.js'

export default async function handler(req, res) {
  try {
    const data = await shopifyGetOne('locations.json', { limit: 250 })
    const locations = (data.locations || [])
      .filter(l => l.active)
      .map(l => ({ id: l.id, name: l.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
    res.status(200).json({ locations })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
