export default async function handler(req, res) {
  const { code, shop } = req.query

  if (!code || !shop) {
    return res.status(400).send('Missing code or shop parameter.')
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })

  const tokenData = await tokenRes.json()

  if (!tokenRes.ok || !tokenData.access_token) {
    return res.status(500).send(`Failed to get access token: ${JSON.stringify(tokenData)}`)
  }

  return res.status(200).send(`
    <html>
      <body style="font-family:monospace;padding:40px;background:#f4f6f4;">
        <h2 style="color:#005F2C;">App installed successfully</h2>
        <p>Copy this access token and add it to Netlify as <strong>SHOPIFY_ACCESS_TOKEN</strong>:</p>
        <div style="background:#fff;border:1px solid #ccc;padding:16px;border-radius:6px;font-size:14px;word-break:break-all;margin-top:12px;">
          ${tokenData.access_token}
        </div>
        <p style="margin-top:20px;color:#888;font-size:12px;">Once added to Netlify, you can close this page.</p>
      </body>
    </html>
  `)
}
