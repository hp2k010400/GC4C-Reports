// Builds the article body HTML — a proper editorial layout rather than
// bare h2/p/img. <style> tags survive Shopify's sanitizer on Article body
// (confirmed by testing, unlike Page descriptionHtml which strips them),
// so this gets real design: framed/capped product images (the raw photos
// were being stretched to the full ~700px content width, which is what
// made them look blurry — capping them to their intended size fixes that),
// a distinct "lede" treatment for the opening paragraph, and clear
// rhythm between sections instead of a flat wall of h2/p/h2/p.
//
// heroImage: an optional full-width banner (e.g. a real infographic pasted
// into the source doc) rendered at the very top, above the intro — kept
// separate from Shopify's native article.image on purpose (that field ties
// "has image" directly to a giant non-toggleable theme hero with no
// independent on/off switch; this renders inside the body instead, where
// we control it fully).
// sections[i].level: 2 or 3 (defaults to 2) — lets a doc's H2/H3 hierarchy
// come through instead of flattening everything to one heading size.
// sections[i].paragraphs: a mixed array in real document order — plain
// strings are prose, and { table: [[cell,...], ...] } entries are real
// tables (a section can contain more than one). Rendered in that same
// order rather than as two separate lists (all paragraphs, then all
// tables) — the latter dumps every table in a section to the bottom
// regardless of where it actually belonged in the copy, which is exactly
// what the agency flagged as wrong on the live article. Each table's
// first row is treated as its header.
// sources: an optional numbered citation list rendered at the very end.
export function buildBlogBodyHtml({ subtitle, heroImage, introParagraphs, sections, sources }) {
  const style = `<style>
.gc4c-post{color:#1c1f1a;}
.gc4c-post .gc4c-subtitle{font-size:1.15rem;color:#5b6259;text-align:center;margin:0 0 1.5rem;font-style:italic;}
.gc4c-post .gc4c-hero{max-width:100%;margin:0 0 2rem;}
.gc4c-post .gc4c-hero img{width:100%;display:block;}
.gc4c-post .gc4c-lede{font-size:20px;line-height:32px;color:#3f4640;}
.gc4c-post .gc4c-section{margin-top:2.8rem;padding-top:2.2rem;border-top:1px solid #e3e0d6;}
.gc4c-post .gc4c-section:first-of-type{margin-top:2rem;}
.gc4c-post h2{font-size:1.45rem;font-weight:700;color:#0d3d1f;margin:0 0 1.1rem;letter-spacing:-0.01em;text-align:center;}
.gc4c-post h3{font-size:1.2rem;font-weight:700;color:#0d3d1f;margin:1.8rem 0 0.9rem;letter-spacing:-0.01em;text-align:center;}
.gc4c-post .gc4c-img-frame{max-width:400px;margin:0 auto 1.5rem;border-radius:14px;overflow:hidden;border:1px solid #e3e0d6;background:#f6f4ef;box-shadow:0 8px 24px rgba(13,61,31,0.08);}
.gc4c-post .gc4c-img-frame img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;}
.gc4c-post .gc4c-img-frame.natural{max-width:100%;}
.gc4c-post .gc4c-img-frame.natural img{aspect-ratio:auto;height:auto;}
.gc4c-post p{font-size:20px;line-height:32px;color:#333;margin-top:1rem;}
.gc4c-post p a,.gc4c-post .gc4c-lede a{color:#20842e;font-weight:700;text-decoration:underline;}
.gc4c-post .gc4c-table-wrap{margin-top:1.4rem;overflow-x:auto;border:1px solid #e3e0d6;border-radius:10px;}
.gc4c-post table{width:100%;border-collapse:collapse;font-size:0.92rem;}
.gc4c-post table th{background:#f6f4ef;color:#0d3d1f;font-weight:700;text-align:left;padding:0.65rem 0.9rem;border-bottom:2px solid #e3e0d6;}
.gc4c-post table td{padding:0.6rem 0.9rem;border-bottom:1px solid #e3e0d6;}
.gc4c-post table tr:last-child td{border-bottom:none;}
.gc4c-post .gc4c-sources{margin-top:2.8rem;padding-top:1.4rem;border-top:1px solid #e3e0d6;font-size:0.85rem;color:#5b6259;}
.gc4c-post .gc4c-sources h3{font-size:0.95rem;margin:0 0 0.6rem;}
.gc4c-post .gc4c-sources ol{margin:0;padding-left:1.2rem;}
.gc4c-post .gc4c-sources li{margin-top:0.3rem;}
@media(max-width:600px){.gc4c-post .gc4c-img-frame{max-width:100%;}}
</style>`

  const parts = [style, '<div class="gc4c-post">']
  if (heroImage) parts.push(`<div class="gc4c-hero"><img src="${heroImage}" alt=""></div>`)
  if (subtitle) parts.push(`<p class="gc4c-subtitle">${subtitle}</p>`)

  const intro = introParagraphs || []
  intro.forEach((p, i) => {
    parts.push(`<p${i === 0 ? ' class="gc4c-lede"' : ''}>${p}</p>`)
  })

  ;(sections || []).forEach(s => {
    const tag = s.level === 3 ? 'h3' : 'h2'
    parts.push('<div class="gc4c-section">')
    parts.push(`<${tag}>${s.heading}</${tag}>`)
    if (s.image) {
      const natural = s.image.includes('extreme-weather-golf') ? ' natural' : ''
      parts.push(`<div class="gc4c-img-frame${natural}"><img src="${s.image}" alt="${s.heading}"></div>`)
    }
    for (const p of s.paragraphs) {
      if (typeof p === 'string') parts.push(`<p>${p}</p>`)
      else if (p && p.table && p.table.length) parts.push(renderTable(p.table))
    }
    parts.push('</div>')
  })

  if (sources && sources.length) {
    parts.push('<div class="gc4c-sources"><h3>Sources</h3><ol>')
    for (const src of sources) parts.push(`<li>${src}</li>`)
    parts.push('</ol></div>')
  }

  parts.push('</div>')
  return parts.join('\n')
}

// rows[0] is treated as the header row.
function renderTable(rows) {
  const [header, ...body] = rows
  const parts = ['<div class="gc4c-table-wrap"><table>', '<thead><tr>']
  for (const cell of header) parts.push(`<th>${cell}</th>`)
  parts.push('</tr></thead><tbody>')
  for (const row of body) {
    parts.push('<tr>')
    for (const cell of row) parts.push(`<td>${cell}</td>`)
    parts.push('</tr>')
  }
  parts.push('</tbody></table></div>')
  return parts.join('')
}
