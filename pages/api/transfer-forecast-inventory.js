import { shopifyGraphQL } from '../../lib/shopify.js'

// Returns both available and on_hand quantities per location for each inventory item.
// REST inventory_levels only gives available; GraphQL quantities() gives both.
const BATCH = 25 // 25 items × 20 locations × ~2 qty types = safe within GraphQL cost limit

const QUERY = `
  query GetInventoryQuantities($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on InventoryItem {
        id
        inventoryLevels(first: 20) {
          edges {
            node {
              location { legacyResourceId }
              quantities(names: ["available", "on_hand", "committed", "incoming"]) {
                name
                quantity
              }
            }
          }
        }
      }
    }
  }
`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { iids } = req.body || {}
  if (!Array.isArray(iids) || !iids.length) return res.status(400).json({ error: 'iids array required' })

  try {
    const batches = []
    for (let i = 0; i < iids.length; i += BATCH) batches.push(iids.slice(i, i + BATCH))

    const results = await Promise.all(batches.map(batch => {
      const gids = batch.map(id => `gid://shopify/InventoryItem/${id}`)
      return shopifyGraphQL(QUERY, { ids: gids }).catch(() => ({ nodes: [] }))
    }))

    // { [iid]: { [locationId]: { available, onHand } } }
    const map = {}
    for (const result of results) {
      for (const node of (result.nodes || [])) {
        if (!node?.id) continue
        const iid = node.id.split('/').pop()
        map[iid] = {}
        for (const { node: level } of (node.inventoryLevels?.edges || [])) {
          const locId = level.location?.legacyResourceId
          if (!locId) continue
          const qtys = {}
          for (const q of (level.quantities || [])) qtys[q.name] = q.quantity
          map[iid][locId] = {
            available: qtys.available ?? 0,
            onHand:    qtys.on_hand   ?? 0,
            incoming:  qtys.incoming  ?? 0,
            committed: qtys.committed ?? 0,
          }
        }
      }
    }

    res.status(200).json({ map })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
