export default async function handler(req, res) {
  const { code, shop } = req.query

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code,
    }),
  })

  const { access_token, error } = await tokenRes.json()

  if (error || !access_token) {
    return res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px"><h2>Error</h2><p>${error || 'No token returned'}</p></body></html>`)
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>App Installed</title></head>
      <body style="font-family:-apple-system,sans-serif;padding:40px;background:#f4f6f8;max-width:600px;margin:0 auto">
        <div style="background:white;border-radius:8px;padding:32px;border:1px solid #e0e0e0">
          <div style="color:#005F2C;font-size:24px;font-weight:700;margin-bottom:8px">GC4C Reports</div>
          <h2 style="color:#1a1a1a;margin-bottom:16px">App installed successfully</h2>
          <p style="color:#666;margin-bottom:24px">Copy the token below and add it to your Vercel environment variables as <strong>SHOPIFY_ACCESS_TOKEN</strong>, then redeploy.</p>
          <pre style="background:#1a1a1a;color:#4ade80;padding:20px;border-radius:6px;word-break:break-all;font-size:13px">${access_token}</pre>
          <p style="color:#999;font-size:13px;margin-top:16px">Once added to Vercel, the reports dashboard will be fully operational.</p>
        </div>
      </body>
    </html>
  `)
}
