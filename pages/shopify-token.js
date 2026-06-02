export async function getServerSideProps({ query }) {
  const { code, shop } = query

  if (!code || !shop) {
    return { props: { error: 'No code or shop in URL' } }
  }

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
    if (!data.access_token) return { props: { error: JSON.stringify(data) } }
    return { props: { token: data.access_token } }
  } catch (e) {
    return { props: { error: e.message } }
  }
}

export default function ShopifyToken({ token, error }) {
  if (error) return (
    <div style={{ fontFamily: 'monospace', padding: 40 }}>
      <h2 style={{ color: '#c0392b' }}>Error</h2>
      <p>{error}</p>
    </div>
  )
  return (
    <div style={{ fontFamily: 'monospace', padding: 40, background: '#f4f6f4', minHeight: '100vh' }}>
      <h2 style={{ color: '#005F2C' }}>Token retrieved — copy and add to Netlify as SHOPIFY_ACCESS_TOKEN</h2>
      <div style={{ background: '#fff', border: '1px solid #ccc', padding: 16, borderRadius: 6, fontSize: 14, wordBreak: 'break-all', marginTop: 12 }}>
        {token}
      </div>
    </div>
  )
}
