import crypto from 'crypto'

export default function handler(req, res) {
  const store = req.query.shop || process.env.SHOPIFY_STORE
  const state = crypto.randomBytes(16).toString('hex')
  const redirectUri = `${process.env.NEXT_PUBLIC_URL}/api/auth/callback`
  const scopes = 'read_all_orders,read_inventory,read_locations,read_orders,read_products'

  const authUrl =
    `https://${store}/admin/oauth/authorize` +
    `?client_id=${process.env.SHOPIFY_CLIENT_ID}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`

  res.redirect(authUrl)
}
