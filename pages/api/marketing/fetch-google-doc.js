// Fetches a Google Doc's plain-text export server-side (avoids the browser
// CORS block on docs.google.com, and saves a manual copy/paste round trip).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { url } = req.body
  const m = (url || '').match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (!m) return res.status(400).json({ error: 'Not a recognisable Google Doc URL' })
  const docId = m[1]

  try {
    const resp = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`)
    if (!resp.ok) throw new Error(`Google Docs export returned ${resp.status} — check the doc is shared "Anyone with the link can view"`)
    const text = await resp.text()
    return res.status(200).json({ text })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
