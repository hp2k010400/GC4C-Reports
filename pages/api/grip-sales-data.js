import { shopifyGraphQL, shopifyGetOne } from '../../lib/shopify.js'

const GRIP_TYPES = new Set(['golf club grips', 'golf club grip'])
const PAGES_PER_CALL = 3

const ORDERS_QUERY = `
  query($cursor: String, $q: String!) {
    orders(first: 50, after: $cursor, query: $q) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          name
          createdAt
          locationId
          lineItems(first: 100) {
            edges {
              node {
                title
                sku
                quantity
                originalUnitPriceSet { shopMoney { amount } }
                product { productType }
              }
            }
          }
        }
      }
    }
  }
`

export default async function handler(req, res) {
  const { startDate, endDate, cursor: startCursor } = req.query
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' })

  try {
    // locationId in GraphQL is a GID like "gid://shopify/Location/12345" — resolve to names via REST
    const locData = await shopifyGetOne('locations.json')
    const locationMap = {}
    for (const loc of (locData.locations || [])) {
      locationMap[`gid://shopify/Location/${loc.id}`] = loc.name
    }

    const q = `source_name:pos created_at:>='${startDate}' created_at:<='${endDate}T23:59:59'`

    let posQty = 0, posRevenue = 0
    let gripQty = 0, gripRevenue = 0
    const byStore = {}
    const gripRows = []

    let cursor = startCursor || null
    let hasNext = true
    let pagesCount = 0

    while (hasNext && pagesCount < PAGES_PER_CALL) {
      const data = await shopifyGraphQL(ORDERS_QUERY, { cursor, q })
      const page = data.orders

      for (const { node: order } of page.edges) {
        const store = locationMap[order.locationId] || 'Unknown'
        if (!byStore[store]) byStore[store] = { posQty: 0, posRevenue: 0, gripQty: 0, gripRevenue: 0 }

        for (const { node: item } of order.lineItems.edges) {
          const qty = item.quantity
          const price = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount || 0)
          const lineTotal = qty * price
          const isGrip = GRIP_TYPES.has((item.product?.productType || '').toLowerCase())

          posQty += qty
          posRevenue += lineTotal
          byStore[store].posQty += qty
          byStore[store].posRevenue += lineTotal

          if (isGrip) {
            gripQty += qty
            gripRevenue += lineTotal
            byStore[store].gripQty += qty
            byStore[store].gripRevenue += lineTotal
            gripRows.push({
              Date: order.createdAt.slice(0, 10),
              Store: store,
              Order: order.name,
              Product: item.title,
              SKU: item.sku || '',
              Qty: qty,
              'Unit Price': price.toFixed(2),
              'Line Total': lineTotal.toFixed(2),
            })
          }
        }
      }

      cursor = page.pageInfo.endCursor
      hasNext = page.pageInfo.hasNextPage
      pagesCount++
    }

    res.json({
      partial: {
        posQty,
        posRevenue: parseFloat(posRevenue.toFixed(2)),
        gripQty,
        gripRevenue: parseFloat(gripRevenue.toFixed(2)),
        byStore,
      },
      gripRows,
      nextCursor: hasNext ? cursor : null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
