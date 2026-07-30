// Google Docs' plain-text export drops every hyperlink — only the anchor
// words survive, not the URL. This pulls real (anchorText, url) pairs out
// of the HTML export instead, and weaves them back into the plain text as
// literal <a href="..."> tags, so links embedded mid-sentence in the doc
// (not just typed-out URLs or "CTA LINK -" lines) carry through to the
// page. Everything else about the doc's text/structure is untouched —
// only exact matches of the linked words get wrapped.

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”')
    .replace(/&ldquo;/g, '“')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

// Google wraps every link in a click-tracking redirect:
// https://www.google.com/url?q=<real url>&sa=D&source=editors&ust=...
function resolveRealUrl(href) {
  const decoded = decodeEntities(href)
  const m = decoded.match(/^https:\/\/www\.google\.com\/url\?q=([^&]+)/)
  if (m) return decodeURIComponent(m[1])
  return decoded
}

export function extractDocLinks(html) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] || html
  const links = []
  for (const m of body.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = resolveRealUrl(m[1])
    const anchorText = decodeEntities(m[2].replace(/<[^>]+>/g, '')).trim()
    if (anchorText && url) links.push({ anchorText, url })
  }
  return links
}

export function linkifyText(text, links) {
  const matches = []
  for (const { anchorText, url } of links) {
    // Anchor text that's just the URL itself is already handled by the
    // plain-URL extraction elsewhere in the parser — only weave in links
    // on real descriptive words. Short text is skipped since a 3-4
    // character match is too likely to land on the wrong occurrence.
    if (anchorText.length < 8) continue
    if (/^https?:\/\//.test(anchorText)) continue
    const idx = text.indexOf(anchorText)
    if (idx === -1) continue
    matches.push({ idx, end: idx + anchorText.length, anchorText, url })
  }
  // Apply right-to-left so earlier splices don't shift later indices.
  matches.sort((a, b) => b.idx - a.idx)
  let result = text
  for (const { idx, end, anchorText, url } of matches) {
    result = result.slice(0, idx) + `<a href="${url}">${anchorText}</a>` + result.slice(end)
  }
  return result
}
