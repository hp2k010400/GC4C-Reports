// Fetches a Google Doc's plain-text export server-side (avoids the browser
// CORS block on docs.google.com, and saves a manual copy/paste round trip).
// Also pulls the HTML export just to lift out any embedded images Murray
// has pasted in as visual references (e.g. "here's how the tile grid should
// look") — these are for us to look at while building, not page content, so
// they're returned separately rather than folded into the parsed doc text.
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

    let images = []
    try {
      const htmlResp = await fetch(`https://docs.google.com/document/d/${docId}/export?format=html`)
      if (htmlResp.ok) {
        const html = await htmlResp.text()
        const seen = new Set()
        for (const m of html.matchAll(/<img[^>]+src="(data:image\/(?:png|jpeg);base64,[^"]+)"/g)) {
          if (!seen.has(m[1])) {
            seen.add(m[1])
            images.push(m[1])
          }
        }
      }
    } catch {
      // Reference images are a nice-to-have — never fail the whole load over them.
    }

    return res.status(200).json({ text, images })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
