import { shopifyGetOne } from '../../lib/shopify.js'

export default async function handler(_req, res) {
  try {
    const data = await shopifyGetOne('locations.json', { limit: 250 })
    const locations = (data.locations || [])
      .filter(l => l.active)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(l => ({ id: l.id, name: l.name }))
    res.status(200).json({ locations })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
