// Shared by brand-hub-template.js and clp-template.js — both parse the same
// kind of "one collection/page link per line" doc section.
//
// A real Titleist doc had the SAME list of collection links written twice:
// once as a bare draft ("collections/titleist-vokey-sm10-wedges", no
// domain), then again with the full "https://www.golfclubs4cash.co.uk/..."
// added — but only for the main-category section. The model section
// ("Other Clubs suggestions") only ever got the bare draft version, never
// the full-URL cleanup pass. The old regex only ever matched a literal
// "https://", so that whole section silently extracted zero URLs and
// rendered zero tiles, with no error — "Popular Titleist models" just
// disappeared. Recognizing the bare "collections/<handle>" /
// "pages/<handle>" form too (anchored to the whole trimmed line, so it
// can't false-match a stray mention inside real prose) means a doc that
// never gets the full-URL treatment for a given section still works.
const SITE_BASE = 'https://www.golfclubs4cash.co.uk'

export function extractUrls(blockText) {
  const urls = []
  const seenHandles = new Set()
  for (const raw of (blockText || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let url = null
    if (/^https?:\/\/\S+$/.test(line)) url = line
    else if (/^(collections|pages)\/[\w-]+$/i.test(line)) url = `${SITE_BASE}/${line}`
    if (!url) continue
    // The same Titleist doc lists several collections in BOTH the bare
    // draft form and the full-URL form — a straight concat would show
    // "Shop all Titleist Drivers" as two separate, identical tiles.
    // De-duped by the handle itself (the last path segment), not the
    // whole URL string, so a bare/full pair for the same collection still
    // collapses to one even though the strings differ.
    const handle = url.split('/').filter(Boolean).pop().toLowerCase()
    if (seenHandles.has(handle)) continue
    seenHandles.add(handle)
    urls.push(url)
  }
  return urls
}
