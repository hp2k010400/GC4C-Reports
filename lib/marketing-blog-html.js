// Builds the article body HTML — a proper editorial layout rather than
// bare h2/p/img. <style> tags survive Shopify's sanitizer on Article body
// (confirmed by testing, unlike Page descriptionHtml which strips them),
// so this gets real design: framed/capped product images (the raw photos
// were being stretched to the full ~700px content width, which is what
// made them look blurry — capping them to their intended size fixes that),
// a distinct "lede" treatment for the opening paragraph, and clear
// rhythm between sections instead of a flat wall of h2/p/h2/p.
export function buildBlogBodyHtml({ introParagraphs, sections }) {
  const style = `<style>
.gc4c-post{color:#1c1f1a;}
.gc4c-post .gc4c-lede{font-size:1.1rem;line-height:1.75;color:#3f4640;}
.gc4c-post .gc4c-section{margin-top:2.8rem;padding-top:2.2rem;border-top:1px solid #e3e0d6;}
.gc4c-post .gc4c-section:first-of-type{margin-top:2rem;}
.gc4c-post h2{font-size:1.45rem;font-weight:700;color:#0d3d1f;margin:0 0 1.1rem;letter-spacing:-0.01em;}
.gc4c-post .gc4c-img-frame{max-width:400px;margin:0 auto 1.5rem;border-radius:14px;overflow:hidden;border:1px solid #e3e0d6;background:#f6f4ef;box-shadow:0 8px 24px rgba(13,61,31,0.08);}
.gc4c-post .gc4c-img-frame img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;}
.gc4c-post p{font-size:1rem;line-height:1.75;color:#333;margin-top:1rem;}
.gc4c-post p a,.gc4c-post .gc4c-lede a{color:#20842e;font-weight:700;text-decoration:underline;}
@media(max-width:600px){.gc4c-post .gc4c-img-frame{max-width:100%;}}
</style>`

  const parts = [style, '<div class="gc4c-post">']
  const intro = introParagraphs || []
  intro.forEach((p, i) => {
    parts.push(`<p${i === 0 ? ' class="gc4c-lede"' : ''}>${p}</p>`)
  })
  ;(sections || []).forEach(s => {
    parts.push('<div class="gc4c-section">')
    parts.push(`<h2>${s.heading}</h2>`)
    if (s.image) parts.push(`<div class="gc4c-img-frame"><img src="${s.image}" alt="${s.heading}"></div>`)
    for (const p of s.paragraphs) parts.push(`<p>${p}</p>`)
    parts.push('</div>')
  })
  parts.push('</div>')
  return parts.join('\n')
}
