import { useState } from 'react'
import MarketingHistoryList from '../../components/MarketingHistoryList'
import { extractUrls } from '../../lib/marketing-doc-parsing.js'

// Mirrors lib/marketing-safety.js — pushing to anything outside this list
// requires typing the handle out to confirm, not just clicking a dialog.
const SAFE_TEST_HANDLES = ['marketing-automation-test-page', 'marketing-automation-test']

// Real doc format (matches the actual TaylorMade Brand Hub doc), loose
// prose under section headings rather than strict "Label: value" pairs:
//   SEO Page Title: ...
//   SEO Meta Description: ...
//   Page Copy
//     ...intro note...
//     <H1 text> - H1
//     <paragraph>
//     <paragraph>
//   FAQs Blocks
//     Tier 1 - ...
//     Q? - <question>
//     A - <answer>
//     CTA LINK - <label>
//     ...
//   Child collection links Required
//     https://.../collections/...
//     ...
//   long-form descriptions
//     <Why Brand heading>
//     <paragraph>...
//   Other Clubs suggestions
//     https://.../collections/...
//   Trade-Ins
//     <paragraph>...
//   Go to the clubhouse
//     <paragraph>
//     CTA LINK: <url>

// CTA label -> real URL. Anything not matched here is left unlinked rather
// than guessed, since a wrong link is worse than no link.
function resolveCtaUrl(label, guidesUrl) {
  // If Murray's put the actual URL on the CTA LINK line itself, that always
  // wins over guessing from a label like "MODELS" or "BRAND HUBS".
  const urlMatch = (label || '').match(/https?:\/\/\S+/)
  if (urlMatch) return urlMatch[0]
  const l = (label || '').toLowerCase()
  if (l.includes('condition')) return '/pages/condition-rating-guide'
  if (l.includes('bag') || l.includes('blog')) return guidesUrl || ''
  if (l.includes('delivery')) return '/pages/delivery'
  if (l.includes('brand hub')) return '/collections/all'
  // "HOW TO SELL / SELL TO US" (a PXG FAQ's real CTA label) fell through to
  // this catch-all before — an empty ctaUrl rendered live as a broken
  // self-link (Liquid treats "" as truthy, unlike JS, so the {% if %}
  // guarding it still rendered the anchor with an empty href) rather than
  // no link at all. Fixed at both ends: the render-side blank check, and
  // resolving this specific, real, confirmed label here.
  if (l.includes('sell')) return '/pages/how-to-sell'
  return '' // "MODELS", "fake drivers guide", etc. — no confirmed real URL, left blank on purpose
}

function sectionText(text, startLabel, endLabels) {
  // Prefix match, not exact-line match — real headings carry trailing text
  // like "Child collection links Required - Ordered by GA4 Data".
  const startMatch = text.match(new RegExp('^' + startLabel + '.*$', 'm'))
  if (!startMatch) return ''
  const after = text.slice(startMatch.index + startMatch[0].length)
  let endIdx = after.length
  for (const end of endLabels) {
    const m = after.match(new RegExp('^' + end + '.*$', 'm'))
    if (m && m.index < endIdx) endIdx = m.index
  }
  return after.slice(0, endIdx).trim()
}

function parseBrandHubDoc(text) {
  const get = (label) => {
    const m = text.match(new RegExp('^' + label + ':\\s*(.*)$', 'm'))
    return m ? m[1].trim() : ''
  }

  const pageTitle = get('SEO Page Title')
  const metaDescription = get('SEO Meta Description')
  // Not an embedded image (real docs like this one carry none) — an
  // instruction to go find one: "One of the clubs in the collections or
  // the specific model". Acted on in handleParse once the real category
  // tiles are resolved, rather than parsed further here.
  const featuredImageHint = get('Page Featured image')
  const suggestedLine = (text.match(/^Suggested URL\(s?\):\s*([\s\S]*?)$/m) || [])[1] || ''
  const firstUrl = (suggestedLine.match(/https?:\/\/\S+/) || [])[0] || ''
  const handle = firstUrl.split('/').filter(Boolean).pop() || ''

  const SECTION_MARKERS = [
    'Page Copy', 'FAQs Blocks', 'Child collection links Required',
    'Other brand hubs', 'long-form descriptions', 'Other Clubs suggestions',
    'Trade-Ins', 'Why Choose Us', 'Go to the clubhouse',
  ]

  const pageCopy = sectionText(text, 'Page Copy', SECTION_MARKERS)
  const pcLines = pageCopy.split('\n').map(l => l.trim()).filter(Boolean)
  let h1 = ''
  const heroParagraphs = []
  for (const line of pcLines) {
    if (/-\s*H1\s*$/.test(line)) {
      h1 = line.replace(/-\s*H1\s*$/, '').trim()
    } else if (!/^(meta titles|proposed page example)/i.test(line)) {
      heroParagraphs.push(line)
    }
  }

  const guidesUrlGlobal = (text.match(/Go to the clubhouse[\s\S]*?(https?:\/\/\S+)/) || [])[1] || ''

  const faqBlock = sectionText(text, 'FAQs Blocks', SECTION_MARKERS)
  const faqLines = faqBlock.split('\n').map(l => l.trim()).filter(Boolean)
  const faqs = []
  let tier = ''
  let current = null
  for (const line of faqLines) {
    if (/^Tier \d/i.test(line)) {
      tier = line.split('-')[0].trim()
      continue
    }
    const qMatch = line.match(/^Q\??\s*[-:]?\s*(.+)$/)
    const aMatch = line.match(/^A\s*[-:]\s*(.+)$/)
    const ctaMatch = line.match(/^CTA LINK\s*[-:]?\s*(.+)$/i)
    if (qMatch && !aMatch) {
      if (current) faqs.push(current)
      current = { tier, q: qMatch[1].trim(), a: '', ctaText: '', ctaUrl: '' }
    } else if (aMatch && current) {
      current.a = aMatch[1].trim()
    } else if (ctaMatch && current) {
      const raw = ctaMatch[1].trim()
      // A raw URL isn't meant to be shown as the button's own text — leave
      // ctaText blank so it falls back to "Learn more" instead of printing
      // the literal link.
      current.ctaText = /^https?:\/\//.test(raw) ? '' : raw
      current.ctaUrl = resolveCtaUrl(raw, guidesUrlGlobal)
    } else if (current && !current.a) {
      current.q += ' ' + line
    }
  }
  if (current) faqs.push(current)

  const mainCategoryUrls = extractUrls(sectionText(text, 'Child collection links Required', SECTION_MARKERS))
  const otherCategoryUrls = extractUrls(sectionText(text, 'Other Clubs suggestions', SECTION_MARKERS))
  const otherBrandHubUrls = extractUrls(sectionText(text, 'Other brand hubs', SECTION_MARKERS))

  const longForm = sectionText(text, 'long-form descriptions', SECTION_MARKERS)
  const lfLines = longForm.split('\n').map(l => l.trim()).filter(Boolean)
  const whyBrandHeading = lfLines[0] || ''
  const whyBrandParagraphs = lfLines.slice(1)

  const tradeInBlock = sectionText(text, 'Trade-Ins', SECTION_MARKERS)
  const tradeInParagraphs = tradeInBlock.split('\n').map(l => l.trim()).filter(Boolean)

  const clubhouseBlock = sectionText(text, 'Go to the clubhouse', [])
  const clubhouseLines = clubhouseBlock.split('\n').map(l => l.trim()).filter(Boolean)
  const guidesBody = clubhouseLines.filter(l => !/^CTA LINK/i.test(l)).join(' ')
  const guidesUrl = guidesUrlGlobal

  return {
    handle, pageTitle, metaDescription, h1, heroParagraphs, featuredImageHint,
    whyBrandHeading, whyBrandParagraphs,
    mainCategoryUrls, otherCategoryUrls, otherBrandHubUrls,
    faqs, tradeInParagraphs, guidesUrl, guidesBody,
  }
}

// The reverse of parseBrandHubDoc — turns a real, already-pushed page's
// data (from brand-hub-load.js) back into doc-shaped text, so "Edit" can
// load a real live page back into the same box/parse/preview/push flow
// instead of only pre-filling the target handle (which looked like a dead
// button: nothing about the page's actual content ever appeared). The
// metafields store RESOLVED category tiles ({label, handle, image, count}),
// not the original doc URLs — reconstructed here as real /collections/ and
// /pages/ links from each item's own handle, which round-trips correctly
// through resolveCategory/resolvePageLink on the next parse.
function buildDocTextFromPageData(data) {
  const BASE = 'https://www.golfclubs4cash.co.uk'
  const lines = []
  lines.push(`Suggested URL(s):`, `${BASE}/pages/${data.handle || ''}`, '')
  lines.push(`SEO Page Title: ${data.pageTitle || ''}`)
  lines.push(`SEO Meta Description: ${data.metaDescription || ''}`)
  lines.push('')
  lines.push('Page Copy')
  for (const p of (data.heroParagraphs || [])) {
    // The real H1 paragraph carries the "- H1" suffix; every other hero
    // line is plain intro prose. heroParagraphs doesn't tag which one was
    // the H1 (that's tracked separately as data.h1), so match on content.
    lines.push(p === data.h1 ? `${p} - H1` : p)
  }
  if (data.h1 && !(data.heroParagraphs || []).includes(data.h1)) lines.push(`${data.h1} - H1`)
  lines.push('')
  if ((data.faqs || []).length) {
    lines.push('FAQs Blocks')
    let tierSeen = ''
    for (const f of data.faqs) {
      if (f.tier && f.tier !== tierSeen) { lines.push(f.tier); tierSeen = f.tier }
      lines.push(`Q? - ${f.q}`)
      lines.push(`A - ${f.a}`)
      if (f.ctaText || f.ctaUrl) lines.push(`CTA LINK - ${f.ctaUrl || f.ctaText}`)
    }
    lines.push('')
  }
  lines.push('Child collection links Required')
  for (const c of (data.mainCategories || [])) lines.push(`${BASE}/collections/${c.handle}`)
  lines.push('')
  if ((data.otherBrandHubs || []).length) {
    lines.push('Other brand hubs')
    for (const h of data.otherBrandHubs) lines.push(`${BASE}/pages/${h.handle}`)
    lines.push('')
  }
  if (data.whyBrandHeading || (data.whyBrandParagraphs || []).length) {
    lines.push('long-form descriptions')
    lines.push(data.whyBrandHeading || '')
    for (const p of (data.whyBrandParagraphs || [])) lines.push(p)
    lines.push('')
  }
  lines.push('Other Clubs suggestions')
  for (const c of (data.otherCategories || [])) lines.push(`${BASE}/collections/${c.handle}`)
  lines.push('')
  if ((data.tradeInParagraphs || []).length) {
    lines.push('Trade-Ins')
    for (const p of data.tradeInParagraphs) lines.push(p)
    lines.push('')
  }
  lines.push('Go to the clubhouse')
  if (data.guidesBody) lines.push(data.guidesBody)
  if (data.guidesUrl) lines.push(`CTA LINK: ${data.guidesUrl}`)
  return lines.join('\n')
}

// Mirrors sections/brand-hub.liquid 1:1 (same classes, same markup order) so
// what's shown here is what actually renders on the live page — this never
// writes to Shopify, it only calls the read-only resolve-categories lookup.
// Pulls every link that will actually end up on the page — tile grids,
// CTA buttons, and any inline hyperlink woven into paragraph text — into
// one flat, scannable list, so "is everything linked" has a real answer
// instead of having to hunt through the rendered preview by eye.
function extractInlineLinks(section, text) {
  if (!text) return []
  const found = []
  for (const m of text.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)) {
    found.push({ section, text: m[2], url: m[1] })
  }
  return found
}

function buildLinkMap(brand, parsed, resolved) {
  const links = []

  parsed.heroParagraphs.forEach(p => links.push(...extractInlineLinks('Hero copy', p)))
  parsed.whyBrandParagraphs.forEach(p => links.push(...extractInlineLinks(`Why ${brand || 'brand'}`, p)))
  parsed.tradeInParagraphs.forEach(p => links.push(...extractInlineLinks('Trade-in copy', p)))
  links.push(...extractInlineLinks('Clubhouse copy', parsed.guidesBody))
  parsed.faqs.forEach(f => links.push(...extractInlineLinks(`FAQ answer (${f.tier})`, f.a)))

  resolved.main.forEach(c => links.push({ section: 'Shop by category', text: c.label, url: `/collections/${c.handle}` }))
  resolved.other.forEach(c => links.push({ section: 'Popular models', text: c.label, url: `/collections/${c.handle}` }))
  resolved.otherBrandHubs?.forEach(h => links.push({ section: 'Other brand hubs', text: h.label, url: `/pages/${h.handle}` }))

  parsed.faqs.forEach(f => {
    if (f.ctaUrl) links.push({ section: `FAQ CTA (${f.tier})`, text: f.ctaText || 'Learn more', url: f.ctaUrl })
  })

  if (parsed.tradeInParagraphs.length > 0) {
    links.push({ section: 'Trade-in CTA', text: 'Trade your clubs in here', url: '/pages/sell-your-clubs' })
  }

  links.push(
    { section: 'Why choose us', text: 'See our Trustpilot reviews', url: 'https://www.trustpilot.com/review/golfclubs4cash.co.uk' },
    { section: 'Why choose us', text: 'Read our condition rating guide', url: '/pages/condition-rating-guide' },
    { section: 'Why choose us', text: 'Browse all brands', url: '/collections/all' },
    { section: 'Why choose us', text: 'Delivery information', url: '/pages/delivery' },
  )

  if (parsed.guidesUrl) {
    links.push({ section: 'Clubhouse CTA', text: `Read our ${brand} guides`, url: parsed.guidesUrl })
  }

  return links
}

function BrandHubPreview({ brand, parsed, resolved, heroImageUrl }) {
  const tiers = []
  for (const f of parsed.faqs) if (!tiers.includes(f.tier)) tiers.push(f.tier)

  return (
    <div className="bh-preview">
      <style jsx>{`
        @font-face {
          font-family: 'Open Sans Condensed Preview';
          src: url('https://www.golfclubs4cash.co.uk/cdn/fonts/open_sans_condensed/opensanscondensed_n4.b735817c3758cc70fda491bc4590427f285556cd.woff2') format('woff2');
          font-weight: 400; font-style: normal; font-display: swap;
        }
        @font-face {
          font-family: 'Open Sans Condensed Preview';
          src: url('https://www.golfclubs4cash.co.uk/cdn/fonts/open_sans_condensed/opensanscondensed_n6.e25ccef8c0d23978aca642a1b6db5c9b834ebdf3.woff2') format('woff2');
          font-weight: 600; font-style: normal; font-display: swap;
        }
        @font-face {
          font-family: 'Open Sans Condensed Preview';
          src: url('https://www.golfclubs4cash.co.uk/cdn/fonts/open_sans_condensed/opensanscondensed_n7.540ad984d87539ff9a03e07d9527f1ec85e214bc.woff2') format('woff2');
          font-weight: 700; font-style: normal; font-display: swap;
        }
        .bh-preview { font-family: 'Open Sans Condensed Preview', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1c1f1a; width: 100%; box-sizing: border-box; }
        /* 1600px matches the real site's current --container-width (verified
           live, not the 1140px value from the older note). Tile grids use the
           full width like real product grids; .bh-copy keeps prose readable. */
        .bh-wrap { max-width: 1600px; margin: 0 auto; padding: 0 1.75rem; box-sizing: border-box; }
        .bh-copy { max-width: 900px; margin: 0 auto; }
        .bh-hero { padding: 2.4rem 0 1rem; }
        .bh-hero-image { width: 100%; height: 480px; overflow: hidden; margin-bottom: 1.5rem; }
        .bh-hero-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .bh-hero h1 { font-size: 34px; line-height: 50px; font-weight: 600; margin: 0 auto; max-width: 20ch; text-align: center; }
        .bh-hero p { margin-top: 1rem; color: #5b6259; font-size: 20px; line-height: 32px; }
        .bh-preview p a, .bh-preview .bh-faq p a { color: #20842e; font-weight: 700; text-decoration: underline; }
        .bh-hero p + p { margin-top: 0.9rem; }
        .bh-band { padding: 2.4rem 0; border-top: 1px solid #e3e0d6; }
        .bh-band.paper { background: #fff; }
        .bh-title { font-size: 1.5rem; max-width: 46ch; margin: 0 auto; text-align: center; }
        .bh-tile-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-top: 1.5rem; }
        /* min-width:0 is load-bearing: grid items default to min-width:auto, so a
           real photo's natural pixel size (some Shopify images run 2000px+) can
           still force the whole shared grid column to blow out to fit it — every
           tile in that column, every row, grows along with it.
           The image box uses the old padding-bottom aspect-ratio trick, not the
           aspect-ratio CSS property — its interaction with CSS Grid's own
           intrinsic-sizing pass is genuinely inconsistent and caused the tiles
           to collapse to invisible when min-width was added. Padding-bottom
           derives height purely from width, no such ambiguity, in every
           browser going back over a decade. */
        /* Card chrome (border/radius 4px/shadow/hover-lift) matches Stephen's
           site-wide product-card spec, applied to the collection-tile equivalent. */
        .bh-tile { text-decoration: none; color: #1c1f1a; display: flex; flex-direction: column; min-width: 0; background: #fff; border: 1px solid #d1d1d1; border-radius: 4px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05); overflow: hidden; transition: 0.3s ease; padding-bottom: 15px; }
        .bh-tile:hover { box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15); transform: translateY(-5px) scale(1.02); }
        .bh-tile .frame { position: relative; width: 100%; padding-bottom: 55%; background: #f6f4ef; margin-bottom: 0.6rem; }
        .bh-tile .frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .bh-tile .name { font-size: 16px; font-weight: 700; text-align: center; padding: 0 15px; }
        .bh-tile .count { font-size: 0.65rem; font-weight: 400; color: #5b6259; margin-left: 2px; }
        .bh-cta { display: inline-block; margin-top: 1.2rem; background: #20842e; color: #fff; font-weight: 700; text-decoration: none; padding: 0.7rem 1.3rem; border-radius: 6px; font-size: 0.92rem; }
        .bh-faq { border-bottom: 1px solid #e3e0d6; padding: 0.9rem 0; }
        .bh-faq summary { list-style: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 1rem; font-weight: 700; font-size: 0.95rem; }
        .bh-faq summary::-webkit-details-marker { display: none; }
        .bh-faq summary::after { content: "+"; font-family: monospace; font-size: 1.2rem; color: #b5651d; flex: none; }
        .bh-faq[open] summary::after { content: "\\2212"; }
        .bh-faq p { color: #5b6259; margin-top: 0.6rem; font-size: 20px; line-height: 32px; }
        .bh-faq .faq-cta { display: inline-block; margin-top: 0.5rem; font-size: 0.85rem; font-weight: 700; color: #20842e; text-decoration: underline; }
        .bh-why-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.4rem; margin-top: 1.6rem; }
        .bh-why-item h3 { font-size: 1rem; margin: 0; }
        .bh-why-item p { font-size: 0.9rem; color: #5b6259; margin-top: 0.4rem; }
        .bh-why-item a { font-size: 0.85rem; font-weight: 700; color: #20842e; text-decoration: underline; display: inline-block; margin-top: 0.4rem; }
        .bh-hub-links { display: flex; flex-wrap: wrap; gap: 0.7rem; justify-content: center; margin-top: 1.5rem; }
        .bh-hub-link { text-decoration: none; color: #1c1f1a; font-weight: 700; font-size: 0.9rem; padding: 0.6rem 1.1rem; border: 1px solid #e3e0d6; border-radius: 999px; }
        .bh-clubhouse .bh-copy { text-align: center; }
        .bh-clubhouse h2 { margin: 0; }
        .bh-clubhouse p { margin-top: 0.8rem; }
        @media (max-width: 860px) { .bh-tile-grid { grid-template-columns: repeat(2, 1fr); } }
      `}</style>

      <section className="bh-hero">
        {heroImageUrl && (
          <div className="bh-hero-image"><img src={heroImageUrl} alt={brand} /></div>
        )}
        <div className="bh-wrap">
          <div className="bh-copy">
            <h1>{parsed.h1 || parsed.pageTitle || `${brand} Brand Hub`}</h1>
            {parsed.heroParagraphs.map((p, i) => <p key={i} dangerouslySetInnerHTML={{ __html: p }} />)}
          </div>
        </div>
      </section>

      {parsed.faqs.length > 0 && (
        <section className="bh-band">
          <div className="bh-wrap">
            <div className="bh-copy">
              <h2 className="bh-title" style={{ marginBottom: '0.3rem' }}>{brand} &mdash; your questions answered</h2>
              {(() => {
                let tierSeen = ''
                return parsed.faqs.map((item, i) => {
                  const isTierStart = item.tier !== tierSeen
                  tierSeen = item.tier
                  return (
                    <div key={i}>
                      <details className="bh-faq" style={isTierStart && i > 0 ? { marginTop: '1.4rem' } : undefined}>
                        <summary>{item.q}</summary>
                        <p dangerouslySetInnerHTML={{ __html: item.a }} />
                        {item.ctaUrl && <a className="faq-cta" href={item.ctaUrl} onClick={e => e.preventDefault()}>{item.ctaText || 'Learn more'} &rarr;</a>}
                      </details>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </section>
      )}

      {resolved.main.length > 0 && (
        <section className="bh-band paper">
          <div className="bh-wrap">
            <h2 className="bh-title">Shop {brand} by category</h2>
            <div className="bh-tile-grid">
              {resolved.main.map((c, i) => (
                <a className="bh-tile" href={`/collections/${c.handle}`} key={i} onClick={e => e.preventDefault()}>
                  <div className="frame">{c.image && <img src={c.image} alt={c.label} />}</div>
                  <span className="name">{c.label}{c.count ? <sup className="count">{c.count}</sup> : null}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {resolved.other.length > 0 && (
        <section className="bh-band">
          <div className="bh-wrap">
            <h2 className="bh-title">Popular {brand} models</h2>
            <div className="bh-tile-grid">
              {resolved.other.map((c, i) => (
                <a className="bh-tile" href={`/collections/${c.handle}`} key={i} onClick={e => e.preventDefault()}>
                  <div className="frame">{c.image && <img src={c.image} alt={c.label} />}</div>
                  <span className="name">{c.label}{c.count ? <sup className="count">{c.count}</sup> : null}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {resolved.otherBrandHubs?.length > 0 && (
        <section className="bh-band paper">
          <div className="bh-wrap">
            <div className="bh-copy">
              <h2 className="bh-title">Explore our other brand hubs</h2>
              <div className="bh-hub-links">
                {resolved.otherBrandHubs.map((h, i) => (
                  <a
                    className="bh-hub-link"
                    href={`/pages/${h.handle}`}
                    key={i}
                    onClick={e => e.preventDefault()}
                    style={h.warning ? { borderColor: '#c0392b', color: '#c0392b' } : undefined}
                    title={h.warning || undefined}
                  >
                    {h.warning ? `⚠️ ${h.label}` : h.label}
                  </a>
                ))}
              </div>
              {resolved.otherBrandHubs.some(h => h.warning) && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#c0392b', textAlign: 'center' }}>
                  {resolved.otherBrandHubs.filter(h => h.warning).map((h, i) => <div key={i}>⚠️ /pages/{h.handle}: {h.warning}</div>)}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {parsed.whyBrandParagraphs.length > 0 && (
        <section className="bh-band">
          <div className="bh-wrap">
            <div className="bh-copy">
              <h2 className="bh-title">{parsed.whyBrandHeading}</h2>
              <div style={{ marginTop: '1rem' }}>
                {parsed.whyBrandParagraphs.map((p, i) => <p key={i} style={{ color: '#5b6259', marginTop: '0.9rem', fontSize: 20, lineHeight: '32px' }} dangerouslySetInnerHTML={{ __html: p }} />)}
              </div>
            </div>
          </div>
        </section>
      )}

      {parsed.tradeInParagraphs.length > 0 && (
        <section className="bh-band paper">
          <div className="bh-wrap">
            <div className="bh-copy">
              <h2 className="bh-title">Trade in your {brand} clubs</h2>
              {parsed.tradeInParagraphs.map((p, i) => <p key={i} style={{ color: '#5b6259', marginTop: '0.9rem', fontSize: 20, lineHeight: '32px' }} dangerouslySetInnerHTML={{ __html: p }} />)}
              <div style={{ textAlign: 'center' }}>
                <a className="bh-cta" href="/pages/sell-your-clubs" onClick={e => e.preventDefault()}>Trade your clubs in here</a>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="bh-band">
        <div className="bh-wrap">
          <h2 className="bh-title">Why choose us</h2>
          <div className="bh-why-grid">
            <div className="bh-why-item">
              <h3>Tens of thousands of 5-star reviews</h3>
              <p>Golfers trust us, and they say so. We've earned tens of thousands of 5-star reviews on Trustpilot from players who've bought, sold and traded with us over the years.</p>
              <a href="https://www.trustpilot.com/review/golfclubs4cash.co.uk" onClick={e => e.preventDefault()}>See our Trustpilot reviews</a>
            </div>
            <div className="bh-why-item">
              <h3>Every club hand-inspected and graded</h3>
              <p>Nothing goes on sale until our team has checked it over and graded its condition against the same standard every time. You'll know exactly what you're getting before it arrives.</p>
              <a href="/pages/condition-rating-guide" onClick={e => e.preventDefault()}>Read our condition rating guide</a>
            </div>
            <div className="bh-why-item">
              <h3>A huge range, every major brand</h3>
              <p>Browse one of the UK's largest ranges of used clubs, with fresh stock landing every day. TaylorMade, Callaway, Ping, Titleist, Cobra and Mizuno, all in one place and all well below new prices.</p>
              <a href="/collections/all" onClick={e => e.preventDefault()}>Browse all brands</a>
            </div>
            <div className="bh-why-item">
              <h3>Advice from real golfers</h3>
              <p>We're players first and retailers second. Ask which driver suits your handicap or whether a set is worth the jump, and you'll get a straight answer instead of a push toward the priciest option in the shop.</p>
            </div>
            <div className="bh-why-item">
              <h3>Free UK delivery, easy checkout</h3>
              <p>Free UK delivery on qualifying orders, secure payment, and every club packed to land ready for the first tee.</p>
              <a href="/pages/delivery" onClick={e => e.preventDefault()}>Delivery information</a>
            </div>
          </div>
        </div>
      </section>

      {parsed.guidesUrl && (
        <section className="bh-band bh-clubhouse">
          <div className="bh-wrap">
            <div className="bh-copy">
              <h2>Go to the clubhouse</h2>
              <p style={{ color: '#5b6259', fontSize: 20, lineHeight: '32px' }} dangerouslySetInnerHTML={{ __html: parsed.guidesBody }} />
              <div style={{ textAlign: 'center' }}>
                <a className="bh-cta" href={parsed.guidesUrl} onClick={e => e.preventDefault()}>Read our {brand} guides</a>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

const EMPTY = {
  handle: '', pageTitle: '', metaDescription: '', h1: '', heroParagraphs: [], featuredImageHint: '',
  whyBrandHeading: '', whyBrandParagraphs: [], mainCategoryUrls: [], otherCategoryUrls: [], otherBrandHubUrls: [],
  faqs: [], tradeInParagraphs: [], guidesUrl: '', guidesBody: '',
}

export default function BrandHubTemplate() {
  const [docText, setDocText] = useState('')
  const [brandName, setBrandName] = useState('TaylorMade')
  const [parsed, setParsed] = useState(EMPTY)
  const [status, setStatus] = useState('')
  const [targetHandle, setTargetHandle] = useState('marketing-automation-test')
  const [pushState, setPushState] = useState('idle')
  const [pushError, setPushError] = useState(null)
  const [originalContent, setOriginalContent] = useState(null)
  const [wasCreated, setWasCreated] = useState(false)
  const [resolved, setResolved] = useState({ main: [], other: [], otherBrandHubs: [] })
  const [previewLoading, setPreviewLoading] = useState(false)
  const [docUrl, setDocUrl] = useState('')
  const [docLoading, setDocLoading] = useState(false)
  const [docLoadError, setDocLoadError] = useState(null)
  const [docImages, setDocImages] = useState([])
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [heroImageUploading, setHeroImageUploading] = useState(-1)
  const isProtectedHandle = !SAFE_TEST_HANDLES.includes(targetHandle.trim())

  // Uploads one of the doc's own pasted reference images to Shopify Files as
  // the page's real hero banner — reuses the same upload pipeline built for
  // the blog tool (lib/shopify-files.js), just not wired to any UI there yet.
  // `i` (the image's index in docImages) doubles as the "currently uploading"
  // flag so only that one thumbnail shows a loading state.
  async function handleUseAsHero(dataUri, i) {
    setHeroImageUploading(i)
    try {
      const res = await fetch('/api/marketing/upload-doc-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUri, filename: `${brandName || 'brand'}-hero-${Date.now()}` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHeroImageUrl(data.url)
    } catch (err) {
      setStatus(`Hero image upload failed: ${err.message}`)
    } finally {
      setHeroImageUploading(-1)
    }
  }

  async function handleLoadFromUrl() {
    if (!docUrl.trim()) return
    setDocLoading(true)
    setDocLoadError(null)
    try {
      const res = await fetch('/api/marketing/fetch-google-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: docUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDocText(data.text)
      setDocImages(data.images || [])
      // A new doc means a new brand — don't let a previous brand's already-
      // uploaded hero image silently carry over onto this one's push.
      setHeroImageUrl('')
    } catch (err) {
      setDocLoadError(err.message)
    } finally {
      setDocLoading(false)
    }
  }

  async function handleParse() {
    const next = parseBrandHubDoc(docText)
    setParsed(next)
    setStatus('Loaded ' + new Date().toLocaleTimeString())
    // Freshly parsed content hasn't been pushed yet — always offer "Push live"
    // rather than carrying over a "Revert" state from whatever was parsed
    // and pushed earlier in this browser tab.
    setPushState('idle')
    setPushError(null)
    setOriginalContent(null)
    setWasCreated(false)
    // Fill in the real handle from the doc's own "Suggested URL" — matches
    // blog-template.js. Still shows the red "real, live page" warning and a
    // confirm dialog before anything actually gets pushed to it.
    if (next.handle) setTargetHandle(next.handle)
    setPreviewLoading(true)
    try {
      const res = await fetch('/api/marketing/resolve-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainCategoryUrls: next.mainCategoryUrls,
          otherCategoryUrls: next.otherCategoryUrls,
          otherBrandHubUrls: next.otherBrandHubUrls,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setResolved({ main: data.main, other: data.other, otherBrandHubs: data.otherBrandHubs })
        // "Page Featured image: One of the clubs in the collections or the
        // specific model" — an instruction, not an embedded image (this doc
        // format never pastes one in). The main/other category tiles are
        // already real, brand-specific product photos resolved seconds ago
        // for the grid below — reusing the first one as the hero satisfies
        // the instruction exactly, with no extra Shopify search needed.
        // Never overrides a hero the user already picked by hand.
        if (next.featuredImageHint && !heroImageUrl) {
          const firstReal = [...(data.main || []), ...(data.other || [])].find(c => c.image)
          if (firstReal) setHeroImageUrl(firstReal.image)
        }
      }
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handlePushLive() {
    if (!targetHandle.trim()) return
    // Guards against publishing an empty page: if the doc box was never parsed
    // in this session (or got reset), pushing would otherwise silently go live
    // with the page titled by its raw handle and every section blank.
    if (!parsed.h1 && !parsed.pageTitle) {
      setPushState('error')
      setPushError('Nothing parsed yet — paste the doc and click "Show preview" first, then push. (Pushing now would publish an empty page.)')
      return
    }
    // Checked live, right before the confirm — catches a handle typo/mismatch
    // before it happens. Shopify doesn't error on a colliding handle, it
    // silently appends "-1" and creates an orphaned duplicate instead of
    // updating the page actually meant.
    let check = { exists: false }
    try {
      const checkRes = await fetch(`/api/marketing/check-page?handle=${encodeURIComponent(targetHandle.trim())}`)
      check = await checkRes.json()
    } catch {
      // If the check itself fails, fall through to the push's own real
      // create-or-update logic rather than blocking on a lookup failure.
    }
    const statusLine = check.exists
      ? `Found an existing page: "${check.title}"${check.templateSuffix && check.templateSuffix !== 'brand-hub' ? ` — currently using a DIFFERENT template ("${check.templateSuffix}"); pushing will switch it to the Brand Hub design` : ''}.\nThis will UPDATE that page.`
      : `⚠️ No page currently exists at this handle.\nThis will CREATE A NEW page — if you expected this to update an existing one, stop and check the handle matches the real live URL exactly.`
    const sure = window.confirm(
      isProtectedHandle
        ? `"${targetHandle.trim()}" isn't the usual test handle — this looks like a real, live page.\n\n${statusLine}\n\nIt'll be visible on:\nhttps://www.golfclubs4cash.co.uk/pages/${targetHandle}\n\nContinue?`
        : `${statusLine}\n\nIt'll be visible on:\nhttps://www.golfclubs4cash.co.uk/pages/${targetHandle}\n\nContinue?`
    )
    if (!sure) return
    setPushState('pushing')
    setPushError(null)
    try {
      const res = await fetch('/api/marketing/brand-hub-push-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ...parsed spread FIRST: parsed also has its own `handle` field (the
        // doc's own Suggested URL, often blank) — spreading it after the real
        // target handle would silently overwrite what's actually typed in the
        // box above with that, sending the wrong (or empty) handle instead.
        body: JSON.stringify({ ...parsed, brandName, heroImage: heroImageUrl, handle: targetHandle.trim(), confirmHandle: targetHandle.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOriginalContent(data.original)
      setWasCreated(data.created)
      setPushState('live')
    } catch (err) {
      setPushState('error')
      setPushError(err.message)
    }
  }

  async function handleRevert() {
    if (!targetHandle.trim()) return
    const sure = window.confirm(
      wasCreated
        ? `This page didn't exist before your last push — reverting deletes it entirely.\n\nContinue?`
        : `This restores the page to what it looked like before your last push, undoing whatever is currently live on:\nhttps://www.golfclubs4cash.co.uk/pages/${targetHandle}\n\nContinue?`
    )
    if (!sure) return
    setPushState('reverting')
    setPushError(null)
    try {
      const res = await fetch('/api/marketing/brand-hub-revert-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: targetHandle.trim(), original: originalContent, created: wasCreated }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOriginalContent(null)
      setPushState('idle')
    } catch (err) {
      setPushState('error')
      setPushError(err.message)
    }
  }

  return (
    <div className="container">
      <div className="page-title">Brand Hub Template</div>
      <div className="page-sub">
        One shared template for the ~16 Brand Hub pages, matching the real doc structure: editorial H1, two GA4-ordered category tile rows,
        3-tier FAQs with CTA links, brand trade-in copy, shared Why Choose Us, and a guides CTA.
      </div>

      <MarketingHistoryList
        title="Brand hubs done so far"
        listEndpoint="/api/marketing/brand-hub-list"
        resetEndpoint="/api/marketing/brand-hub-reset"
        seoEndpoint="/api/marketing/brand-hub-seo"
        baseUrl="https://www.golfclubs4cash.co.uk/pages/"
        onUseHandle={(handle) => setTargetHandle(handle)}
      />

      <div className="settings-section">
        <h3 className="settings-section-title">1. Paste the copy doc</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <label className="settings-label" style={{ alignSelf: 'center' }}>Brand name</label>
          <input className="form-input" style={{ width: 200 }} value={brandName} onChange={e => setBrandName(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder="Or paste the Google Doc share link here to load it automatically…"
            value={docUrl}
            onChange={e => setDocUrl(e.target.value)}
          />
          <button className="btn btn-secondary" onClick={handleLoadFromUrl} disabled={docLoading || !docUrl.trim()}>
            {docLoading ? 'Loading…' : 'Load doc'}
          </button>
        </div>
        {docLoadError && <div style={{ fontSize: 12.5, color: '#c0392b', marginBottom: 8 }}>{docLoadError}</div>}
        {docImages.length > 0 && (
          <div style={{ marginBottom: 10, padding: 10, background: '#fafafa', border: '1px solid #eee', borderRadius: 6 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
              Reference image{docImages.length > 1 ? 's' : ''} pasted into the doc — pick one to use as the page's featured hero banner (uploaded to Shopify Files on push):
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {docImages.map((src, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <img src={src} alt={`Doc reference ${i + 1}`} style={{ maxWidth: 260, maxHeight: 180, border: '1px solid #ddd', borderRadius: 4, display: 'block' }} />
                  <button
                    className="btn btn-secondary"
                    style={{ marginTop: 4, fontSize: 11, padding: '3px 8px' }}
                    onClick={() => handleUseAsHero(src, i)}
                    disabled={heroImageUploading !== -1}
                  >
                    {heroImageUploading === i ? 'Uploading…' : 'Use as hero image'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {heroImageUrl && (
          <div style={{ marginBottom: 10, padding: 10, background: '#f0f9f0', border: '1px solid #cde8cd', borderRadius: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
            <img src={heroImageUrl} alt="Selected hero" style={{ width: 120, height: 48, objectFit: 'cover', borderRadius: 4 }} />
            <div style={{ fontSize: 12, color: '#3a7d3a', flex: 1 }}>Hero image set — uploaded to Shopify Files, will be pushed as the page's featured banner.</div>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setHeroImageUrl('')}>Remove</button>
          </div>
        )}
        <textarea
          className="form-input"
          style={{ width: '100%', minHeight: 220, fontFamily: 'monospace', fontSize: 12.5 }}
          placeholder="...or paste the full brand hub doc text here"
          value={docText}
          onChange={e => setDocText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <button className="btn btn-primary" onClick={() => handleParse()} disabled={!docText.trim()}>Show preview</button>
          {status && <span style={{ fontSize: 12, color: '#888' }}>{status}{previewLoading ? ' — resolving category images…' : ''}</span>}
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #ddd' }}>
          <label className="settings-label" style={{ display: 'block', marginBottom: 6 }}>Test page to push to (its own dedicated, unlinked URL)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="form-input" style={{ width: 340 }} value={targetHandle} onChange={e => { setTargetHandle(e.target.value); setPushError(null); if (pushState === 'error') setPushState('idle') }} />
            <a className="btn btn-secondary" href={`https://www.golfclubs4cash.co.uk/pages/${targetHandle}`} target="_blank" rel="noopener noreferrer">View page</a>
          </div>
          {isProtectedHandle && targetHandle.trim() && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#c0392b' }}>
              "{targetHandle.trim()}" isn't the usual test handle — this looks like a real, live page.
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {pushState !== 'live' ? (
            <button
              className="btn btn-primary"
              style={{ background: '#c0392b' }}
              onClick={handlePushLive}
              disabled={pushState === 'pushing' || !targetHandle.trim()}
            >
              {pushState === 'pushing' ? 'Pushing…' : 'Push live'}
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={handleRevert} disabled={pushState === 'reverting'}>
              {pushState === 'reverting' ? 'Reverting…' : wasCreated ? 'Revert (delete)' : 'Revert (undo)'}
            </button>
          )}
          {pushState === 'live' && <span style={{ fontSize: 12.5, color: '#1a7a2e', fontWeight: 600 }}>Live on that test page now.</span>}
          {pushState === 'error' && <span style={{ fontSize: 12.5, color: '#c0392b' }}>{pushError}</span>}
        </div>
      </div>

      {status && (
        <div className="settings-section" style={{ padding: 0, overflow: 'hidden' }}>
          <h3 className="settings-section-title" style={{ padding: '14px 18px 0' }}>Live preview (renders the real design — no Shopify writes)</h3>
          <BrandHubPreview brand={brandName} parsed={parsed} resolved={resolved} heroImageUrl={heroImageUrl} />
        </div>
      )}

      {status && (
        <div className="settings-section">
          <h3 className="settings-section-title">Link map — every link on this page, and where it goes</h3>
          {(() => {
            const links = buildLinkMap(brandName, parsed, resolved)
            if (links.length === 0) return <div style={{ fontSize: 13, color: '#888' }}>No links resolved yet.</div>
            const bySection = {}
            for (const l of links) (bySection[l.section] ??= []).push(l)
            return Object.entries(bySection).map(([section, items]) => (
              <div key={section} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{section}</div>
                {items.map((l, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, padding: '3px 0' }}>
                    <span>{l.text}</span>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: '#20842e', wordBreak: 'break-all' }}>{l.url}</a>
                  </div>
                ))}
              </div>
            ))
          })()}
        </div>
      )}

      <div className="settings-section">
        <h3 className="settings-section-title">Parsed fields</h3>
        {[
          ['Handle', parsed.handle],
          ['Page title', parsed.pageTitle],
          ['H1', parsed.h1],
          ['Hero paragraphs', parsed.heroParagraphs.length],
          ['Why-brand heading', parsed.whyBrandHeading],
          ['Why-brand paragraphs', parsed.whyBrandParagraphs.length],
          ['Main categories', parsed.mainCategoryUrls.length],
          ['Other categories', parsed.otherCategoryUrls.length],
          ['Other brand hubs', parsed.otherBrandHubUrls.length],
          ['FAQs', parsed.faqs.length],
          ['Trade-in paragraphs', parsed.tradeInParagraphs.length],
          ['Guides URL', parsed.guidesUrl],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}>
            <span style={{ color: '#888' }}>{label}</span><span>{value || '—'}</span>
          </div>
        ))}
        {parsed.faqs.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>FAQ CTA links resolved (blank = no confident match, left unlinked on purpose):</div>
            {parsed.faqs.map((f, i) => (
              <div key={i} style={{ fontSize: 12.5, padding: '3px 0' }}>
                <strong>{f.q}</strong> {f.ctaText && <span style={{ color: f.ctaUrl ? '#1a7a2e' : '#c0392b' }}>[{f.ctaText} &rarr; {f.ctaUrl || 'unresolved'}]</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
