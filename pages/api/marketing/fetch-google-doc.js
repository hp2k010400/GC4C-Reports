import { extractDocLinks, linkifyText } from '../../../lib/doc-links.js'

// Fetches a Google Doc's plain-text export server-side (avoids the browser
// CORS block on docs.google.com, and saves a manual copy/paste round trip).
// Also pulls the HTML export, used for two things the plain text can't
// give us: embedded reference images Murray pastes in (visual reference
// only, not page content — returned separately), and real hyperlinks —
// plain text drops every link, keeping only the highlighted words, so any
// link Murray embeds mid-sentence would otherwise vanish. Those get woven
// back into the text as literal <a href> tags before it's returned.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { url } = req.body
  const m = (url || '').match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (!m) return res.status(400).json({ error: 'Not a recognisable Google Doc URL' })
  const docId = m[1]

  try {
    const resp = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`)
    if (!resp.ok) throw new Error(`Google Docs export returned ${resp.status} — check the doc is shared "Anyone with the link can view"`)
    let text = await resp.text()

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

        const links = extractDocLinks(html)
        text = linkifyText(text, links)
      }
    } catch {
      // Reference images/links are a nice-to-have — never fail the whole load over them.
    }

    return res.status(200).json({ text, images })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
