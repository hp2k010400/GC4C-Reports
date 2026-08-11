export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { password } = req.body || {}
  if (!password || password !== process.env.PARCEL_CLAIMS_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' })
  }

  // No cookie/session set on purpose — this only verifies the password for
  // the in-page gate, which resets on every page load (nothing persisted).
  res.status(200).json({ ok: true })
}
