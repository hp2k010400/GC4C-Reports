export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { password } = req.body || {}
  if (!password || password !== process.env.ADJUSTMENTS_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' })
  }

  const maxAge = 60 * 60 * 24 * 60 // 60 days
  res.setHeader('Set-Cookie', `adj_auth=${encodeURIComponent(password)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`)
  res.status(200).json({ ok: true })
}
