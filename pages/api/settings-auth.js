export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { password } = req.body || {}
  if (!password || password !== process.env.SETTINGS_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' })
  }

  // No cookie/session set on purpose — resets every page load, same as the
  // Stock Adjustments gate.
  res.status(200).json({ ok: true })
}
