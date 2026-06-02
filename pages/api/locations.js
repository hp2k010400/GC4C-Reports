import { shopifyGetOne } from '../../lib/shopify.js'

export default async function handler(req, res) {
  // OAuth callback handler — used when reinstalling the Shopify Partners app to get a new token
  if (req.query.code && req.query.shop) {
    const { code, shop } = req.query
    try {
      const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.SHOPIFY_CLIENT_ID,
          client_secret: process.env.SHOPIFY_CLIENT_SECRET,
          code,
        }),
      })
      const data = await tokenRes.json()
      if (!data.access_token) return res.status(500).send(`Failed: ${JSON.stringify(data)}`)
      return res.status(200).send(`
        <html><body style="font-family:monospace;padding:40px;background:#f4f6f4;">
          <h2 style="color:#005F2C;">Token — copy to Netlify as SHOPIFY_ACCESS_TOKEN</h2>
          <div style="background:#fff;border:1px solid #ccc;padding:16px;border-radius:6px;font-size:14px;word-break:break-all;margin-top:12px;">
            ${data.access_token}
          </div>
        </body></html>
      `)
    } catch (e) {
      return res.status(500).send(e.message)
    }
  }

  // Normal locations fetch
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
