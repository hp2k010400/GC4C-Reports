import { shopifyFetchPage, shopifyGetOne } from '../../lib/shopify.js'
import { STAFF_NAMES } from '../../lib/staff-names.js'

function staffFromTags(tags) {
  if (!tags) return null
  const arr = typeof tags === 'string' ? tags.split(',') : tags
  const t = arr.find(t => t.trim().toLowerCase().startsWith('staff:'))
  return t ? t.trim().slice(6).trim() : null
}

const PAGES_PER_CALL = 2

async function loadGripVariantIds() {
  const ids = new Set()
  for (const type of ['Golf Club Grips', 'Golf club grips']) {
    let pageInfo = null
    do {
      const params = pageInfo
        ? { page_info: pageInfo }
        : { product_type: type, limit: 250, fields: 'id,variants' }
      const { items, nextPageInfo } = await shopifyFetchPage('products.json', 'products', params)
      for (const p of items) {
        for (const v of (p.variants || [])) ids.add(v.id)
      }
      pageInfo = nextPageInfo
    } while (pageInfo)
  }
  return ids
}

export default async function handler(req, res) {
  const { startDate, endDate, locationId, cursor: startCursor } = req.query
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' })

  try {
    if (!locationId) {
      const [locData, usersData] = await Promise.all([
        shopifyGetOne('locations.json'),
        shopifyGetOne('users.json').catch(() => ({ users: [] })),
      ])
      const users = { ...STAFF_NAMES }
      for (const u of (usersData.users || [])) {
        users[String(u.id)] = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || String(u.id)
      }
      return res.json({
        locations: (locData.locations || []).map(l => ({ id: l.id, name: l.name })),
        users,
      })
    }

    const [gripIds, locData] = await Promise.all([
      loadGripVariantIds(),
      shopifyGetOne('locations.json'),
    ])
    const storeName = (locData.locations || []).find(l => String(l.id) === locationId)?.name || 'Unknown'

    let posQty = 0, posRevenue = 0, gripQty = 0, gripRevenue = 0, totalOrders = 0
    const byUser = {}
    const gripRows = []
    let currentCursor = startCursor || null
    let pagesCount = 0

    do {
      const params = currentCursor
        ? { page_info: currentCursor }
        : {
            status: 'any',
            fields: 'id,name,created_at,line_items,user_id,tags',
            created_at_min: new Date(startDate).toISOString(),
            created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
            location_id: locationId,
            limit: 250,
          }

      const { items, nextPageInfo } = await shopifyFetchPage('orders.json', 'orders', params)

      for (const order of items) {
        totalOrders++
        const staffName = staffFromTags(order.tags) || STAFF_NAMES[String(order.user_id)] || null
        const userId = staffName || String(order.user_id || 'unknown')
        if (!byUser[userId]) byUser[userId] = { totalOrders: 0, gripOrders: 0, gripQty: 0, gripRevenue: 0 }
        byUser[userId].totalOrders++

        let orderHasGrip = false
        for (const item of (order.line_items || [])) {
          const qty = item.quantity
          const price = parseFloat(item.price || 0)
          const lineTotal = qty * price
          const isGrip = gripIds.has(item.variant_id)

          posQty += qty
          posRevenue += lineTotal

          if (isGrip) {
            gripQty += qty
            gripRevenue += lineTotal
            orderHasGrip = true
            byUser[userId].gripQty += qty
            byUser[userId].gripRevenue += lineTotal
            gripRows.push({
              Date: order.created_at.slice(0, 10),
              Store: storeName,
              Order: order.name,
              Product: item.title,
              SKU: item.sku || '',
              Qty: qty,
              'Unit Price': price.toFixed(2),
              'Line Total': lineTotal.toFixed(2),
            })
          }
        }
        if (orderHasGrip) byUser[userId].gripOrders++
      }

      currentCursor = nextPageInfo
      pagesCount++
    } while (currentCursor && pagesCount < PAGES_PER_CALL)

    res.json({
      partial: {
        posQty,
        posRevenue: parseFloat(posRevenue.toFixed(2)),
        gripQty,
        gripRevenue: parseFloat(gripRevenue.toFixed(2)),
        totalOrders,
        store: storeName,
        byUser,
      },
      gripRows,
      nextCursor: currentCursor,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
