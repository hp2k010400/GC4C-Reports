import { useState } from 'react'
import MarketingHistoryList from '../../components/MarketingHistoryList'

const SAFE_TEST_HANDLES = ['marketing-automation-test-page', 'marketing-automation-test', 'marketing-automation-test-article']

// Real doc format (from Murray's actual CLP example doc, "Drivers"):
//   Suggested URL(s): / SEO Page Title: / SEO Meta Description:
//   Hero Section
//     <Topic>                              <- e.g. "Drivers"
//     H1: <text>
//     Short SEO introduction... / "copy"    <- intro paragraph(s)
//     Trust signals (...) / "copy"          <- comma/bullet list
//     "<label>" CTA LINK/BUTTON
//   Most Viewed
//     ...https://... (real collection URLs, once filled in)
//   Shop by Player Type
//     ...https://...
//   Shop by Brand
//     ...https://...
//   Frequently Asked Questions
//     Q? - / A - / CTA LINK -  (repeated, no tiers this time)
//   Shop by Model
//     ...https://...
//   Featured Collections
//     ...https://...
//   <Topic> Buying Guide                    <- heading varies, e.g. "Driver Buying Guide"
//     <H3 heading> / <paragraph(s)>  (repeated)
//   THE CLUBHOUSE
//     <paragraph>
//     CTA LINK: <url>
//   Additional Internal Links (Footer)
//     <label> - <url>  (once filled in)

function getField(text, label) {
  const m = text.match(new RegExp('^' + label + ':\\s*(.*)$', 'm'))
  return m ? m[1].trim() : ''
}

function sectionText(text, startLabel, endLabels) {
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

const extractUrls = (blockText) => (blockText.match(/https?:\/\/\S+/g) || [])

// Real names exist in the doc for these tile sections even before real
// links are added ("Beginners", "Ping", "G430"...) — extracting them lets
// the design render as real placeholder tiles instead of just vanishing
// until every link is filled in. Handles one-per-line bullets, nested
// bullets, and comma-separated lists on one line.
function extractLabels(blockText) {
  const lines = blockText.split('\n').map(l => l.trim()).filter(Boolean)
  const labels = []
  for (const rawLine of lines) {
    let line = rawLine.replace(/^\*+\s*/, '')
    if (!line) continue
    if (/^https?:\/\//.test(line)) continue
    if (line.toUpperCase() === 'LINK') continue
    if (/:$/.test(line)) continue // instructional intro line, e.g. "...ordered by demand:"
    // Drop a trailing " - explanatory note" (but not a hyphen inside a word)
    line = line.replace(/\s+-\s+.+$/, '')
    if (line.split(',').length >= 3) {
      // comma-separated list on one line, e.g. "G430, Qi35, Qi10, ... etc."
      labels.push(...line.split(',').map(s => s.replace(/\betc\.?$/i, '').trim()).filter(Boolean))
    } else {
      labels.push(line.trim())
    }
  }
  return labels
}

const SECTION_MARKERS = [
  'Hero Section', 'Most Viewed', 'Shop by Player Type', 'Shop by Brand',
  'Frequently Asked Questions', 'Shop by Model', 'Featured Collections',
  'THE CLUBHOUSE', 'Additional Internal Links',
]

function parseClpDoc(text) {
  const suggestedMatch = text.match(/^Suggested URL\(s?\):\s*\n?(https?:\/\/\S+)/m)
  const suggestedUrl = suggestedMatch ? suggestedMatch[1] : ''
  const handle = suggestedUrl.split('/').filter(Boolean).pop() || ''

  const pageTitle = getField(text, 'SEO Page Title')
  const metaDescription = getField(text, 'SEO Meta Description')

  // Hero: topic name, H1, intro paragraph(s), trust signals, CTA button
  const heroBlock = sectionText(text, 'Hero Section', SECTION_MARKERS)
  const heroLines = heroBlock.split('\n').map(l => l.trim()).filter(Boolean)
  let topic = heroLines[0] || ''
  let h1 = ''
  const introParagraphs = []
  const trustSignals = []
  let browseAllLabel = ''
  let browseAllUrl = ''
  let mode = 'intro'
  for (const rawLine of heroLines.slice(1)) {
    // Strip the leading "* " bullet once, up front, so every check below
    // works against the real content regardless of whether the doc bulleted
    // that particular line — this is what "* H1: ..." was silently failing
    // on before (the H1 check only ever looked for a line starting with
    // "H1:", not "* H1:").
    const line = rawLine.replace(/^\*+\s*/, '')
    const h1Match = line.match(/^H1:\s*(.+)$/i)
    if (h1Match) { h1 = h1Match[1].trim(); continue }
    if (/^Short SEO introduction/i.test(line)) { mode = 'intro'; continue }
    if (/^Trust signals/i.test(line)) { mode = 'trust'; continue }
    const ctaMatch = line.match(/^"([^"]+)"\s*CTA LINK\/BUTTON/i)
    if (ctaMatch) {
      browseAllLabel = ctaMatch[1].trim()
      const urlIn = line.match(/https?:\/\/\S+/)
      if (urlIn) browseAllUrl = urlIn[0]
      continue
    }
    if (/^["“]/.test(line)) continue // stray quote-only placeholder lines like "copy"
    const urlOnly = line.match(/^https?:\/\/\S+$/)
    if (urlOnly && !browseAllUrl) { browseAllUrl = urlOnly[0]; continue }
    if (mode === 'trust') {
      trustSignals.push(...line.split(',').map(s => s.trim()).filter(Boolean))
    } else if (mode === 'intro') {
      introParagraphs.push(line)
    }
  }

  // The buying guide's own heading varies by topic ("Driver Buying Guide",
  // "Iron Buying Guide", etc.) and isn't in SECTION_MARKERS, so it has to be
  // found by pattern up front and passed in as an end marker below — otherwise
  // "Featured Collections" would run straight through it to "THE CLUBHOUSE".
  const guideHeadingMatch = text.match(/^.*Buying Guide\s*$/im)
  const buyingGuideHeading = guideHeadingMatch ? guideHeadingMatch[0].trim() : ''
  const buyingGuideHeadingEscaped = buyingGuideHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const FEATURED_END_MARKERS = buyingGuideHeading
    ? [buyingGuideHeadingEscaped, ...SECTION_MARKERS]
    : SECTION_MARKERS

  const mostViewedBlock = sectionText(text, 'Most Viewed', SECTION_MARKERS)
  const playerTypeBlock = sectionText(text, 'Shop by Player Type', SECTION_MARKERS)
  const brandBlock = sectionText(text, 'Shop by Brand', SECTION_MARKERS)
  const modelBlock = sectionText(text, 'Shop by Model', SECTION_MARKERS)
  const featuredBlock = sectionText(text, 'Featured Collections', FEATURED_END_MARKERS)

  const mostViewedUrls = extractUrls(mostViewedBlock)
  const playerTypeUrls = extractUrls(playerTypeBlock)
  const brandUrls = extractUrls(brandBlock)
  const modelUrls = extractUrls(modelBlock)
  const featuredUrls = extractUrls(featuredBlock)

  // Real names the doc already has, even before real links exist — used to
  // render actual placeholder tiles in the preview instead of an empty gap.
  const playerTypeLabels = extractLabels(playerTypeBlock)
  const brandLabels = extractLabels(brandBlock)
  const modelLabels = extractLabels(modelBlock)
  const featuredLabels = extractLabels(featuredBlock)

  // FAQs — same Q?/A/CTA LINK pattern as Brand Hub, no tiers this time.
  const faqBlock = sectionText(text, 'Frequently Asked Questions', SECTION_MARKERS)
  const faqLines = faqBlock.split('\n').map(l => l.trim()).filter(Boolean)
  const faqs = []
  let current = null
  for (const line of faqLines) {
    const qMatch = line.match(/^\*?\s*Q\??\s*[-:]?\s*(.*)$/)
    const aMatch = line.match(/^\*?\s*A\s*[-:]\s*(.*)$/)
    const ctaMatch = line.match(/^\*?\s*CTA LINK\s*[-:]?\s*(.*)$/i)
    if (qMatch && qMatch[1].trim()) {
      if (current && current.q) faqs.push(current)
      current = { q: qMatch[1].trim(), a: '', ctaText: '', ctaUrl: '' }
    } else if (aMatch && current && aMatch[1].trim()) {
      current.a = aMatch[1].trim()
    } else if (ctaMatch && current && ctaMatch[1].trim()) {
      const raw = ctaMatch[1].trim()
      const urlMatch = raw.match(/https?:\/\/\S+/)
      current.ctaText = urlMatch ? '' : raw
      current.ctaUrl = urlMatch ? urlMatch[0] : ''
    }
  }
  if (current && current.q) faqs.push(current)

  // Buying guide content — heading itself already found above (needed early
  // to stop "Featured Collections" from running past it).
  const guideBlock = guideHeadingMatch
    ? sectionText(text, buyingGuideHeadingEscaped, ['THE CLUBHOUSE'])
    : ''
  const guideContentLines = guideBlock
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => !/^\*/.test(l))          // instructional bullet notes
    .filter(l => !/^https?:\/\//.test(l)) // stray URLs
    .filter(l => l.toUpperCase() !== 'LINK') // leftover placeholder tokens
    .filter(l => !/^["“]/.test(l))        // quote-only placeholder lines like "COPY"
  const buyingGuideSections = []
  let curSection = null
  for (const line of guideContentLines) {
    const isHeading = line.length < 70 && !/[.!?]$/.test(line)
    if (isHeading) {
      curSection = { heading: line, paragraphs: [] }
      buyingGuideSections.push(curSection)
    } else if (curSection) {
      curSection.paragraphs.push(line)
    }
  }

  // Clubhouse
  const clubhouseBlock = sectionText(text, 'THE CLUBHOUSE', ['Additional Internal Links'])
  const clubhouseLines = clubhouseBlock.split('\n').map(l => l.trim()).filter(Boolean)
  const clubhouseUrlMatch = clubhouseBlock.match(/CTA LINK:\s*(https?:\/\/\S+)/i)
  const clubhouseUrl = clubhouseUrlMatch ? clubhouseUrlMatch[1] : ''
  const clubhouseBody = clubhouseLines
    .filter(l => !/^CTA LINK/i.test(l))
    .filter(l => !/^["“]/.test(l)) // quote-only placeholder lines like "COPY"
    .join(' ')

  // Footer links — "Label - https://..." or "Label" alone (left unlinked
  // if no URL is present, same "no guess" rule as everywhere else).
  const footerBlock = sectionText(text, 'Additional Internal Links', [])
  const footerLines = footerBlock.split('\n').map(l => l.trim().replace(/^\*+\s*/, '')).filter(Boolean)
  const footerLinks = footerLines
    .filter(l => l && l.toLowerCase() !== '(footer)')
    .map(l => {
      const urlMatch = l.match(/https?:\/\/\S+/)
      const label = l.replace(/\s*-?\s*https?:\/\/\S+/, '').trim()
      return { label, url: urlMatch ? urlMatch[0] : '' }
    })
    .filter(l => l.url)

  return {
    handle, pageTitle, metaDescription, topic, h1, introParagraphs, trustSignals,
    browseAllLabel, browseAllUrl,
    mostViewedUrls, playerTypeUrls, brandUrls, modelUrls, featuredUrls,
    playerTypeLabels, brandLabels, modelLabels, featuredLabels,
    faqs, buyingGuideHeading, buyingGuideSections,
    clubhouseBody, clubhouseUrl, footerLinks,
  }
}

const EMPTY = {
  handle: '', pageTitle: '', metaDescription: '', topic: '', h1: '', introParagraphs: [], trustSignals: [],
  browseAllLabel: '', browseAllUrl: '',
  mostViewedUrls: [], playerTypeUrls: [], brandUrls: [], modelUrls: [], featuredUrls: [],
  playerTypeLabels: [], brandLabels: [], modelLabels: [], featuredLabels: [],
  faqs: [], buyingGuideHeading: '', buyingGuideSections: [],
  clubhouseBody: '', clubhouseUrl: '', footerLinks: [],
}

// items = real resolved tiles (real image, real /collections/ link) — used
// whenever the doc has real URLs. placeholderLabels = names the doc already
// has even before real links exist ("Beginners", "Ping", "G430"...) — shown
// as unlinked placeholder tiles so the design is visible immediately rather
// than the whole section just vanishing until every link is filled in.
function TileRow({ title, items, placeholderLabels, labelImages }) {
  const usingPlaceholders = !items?.length && placeholderLabels?.length > 0
  const tiles = usingPlaceholders ? placeholderLabels : items
  if (!tiles?.length) return null
  return (
    <div style={{ marginTop: '2rem' }}>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, textAlign: 'center' }}>{title}</h2>
      {usingPlaceholders && (
        <div style={{ textAlign: 'center', fontSize: 11.5, color: '#b5651d', marginTop: 4 }}>
          Real names from the doc, shown as placeholders — no links added yet
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginTop: '1rem' }}>
        {usingPlaceholders
          ? tiles.map((label, i) => {
              const img = labelImages?.[label]
              return (
                // minWidth:0 stops an oversized real photo from forcing its whole
                // shared grid column (every tile in it, every row) out to fit it —
                // grid items default to min-width:auto, which respects intrinsic
                // content size unless explicitly overridden.
                //
                // The image box below uses the old padding-bottom aspect-ratio
                // trick deliberately instead of the `aspect-ratio` CSS property:
                // aspect-ratio's interaction with CSS Grid's own intrinsic-sizing
                // pass is genuinely inconsistent (this is what caused the tiles to
                // collapse to invisible after the minWidth fix) — padding-bottom
                // derives height purely from width, with no such ambiguity, in
                // every browser going back over a decade.
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
                  <div style={{ position: 'relative', width: '100%', paddingBottom: '75%', borderRadius: 6, overflow: 'hidden', background: '#f6f4ef', border: '1px dashed #cbc6b8' }}>
                    {img && <img src={img} alt={label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, textAlign: 'center', color: '#1c1f1a' }}>{label}</span>
                </div>
              )
            })
          : tiles.map((c, i) => (
              <a key={i} href={`/collections/${c.handle}`} onClick={e => e.preventDefault()} style={{ textDecoration: 'none', color: '#1c1f1a', display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
                <div style={{ position: 'relative', width: '100%', paddingBottom: '75%', borderRadius: 6, overflow: 'hidden', background: '#f6f4ef', border: '1px solid #e3e0d6' }}>
                  {c.image && <img src={c.image} alt={c.label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, textAlign: 'center' }}>{c.label}</span>
              </a>
            ))}
      </div>
    </div>
  )
}

function ClpPreview({ parsed, resolved, labelImages }) {
  return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#fff', color: '#1c1f1a', maxWidth: 900, margin: '0 auto', padding: '2.4rem 1.75rem' }}>
      <h1 style={{ fontSize: 'clamp(1.8rem, 3.4vw, 2.4rem)', fontWeight: 700, textAlign: 'center', margin: 0 }}>{parsed.h1}</h1>
      {parsed.introParagraphs.map((p, i) => <p key={i} style={{ color: '#5b6259', marginTop: '1rem' }}>{p}</p>)}
      {parsed.trustSignals.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem 1.4rem', marginTop: '1.2rem' }}>
          {parsed.trustSignals.map((t, i) => <span key={i} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0d3d1f' }}>&#10003; {t}</span>)}
        </div>
      )}
      {parsed.browseAllUrl && (
        <div style={{ textAlign: 'center', marginTop: '1.2rem' }}>
          <a href={parsed.browseAllUrl} onClick={e => e.preventDefault()} style={{ background: '#20842e', color: '#fff', fontWeight: 700, padding: '0.7rem 1.3rem', borderRadius: 6, textDecoration: 'none', fontSize: '0.92rem' }}>{parsed.browseAllLabel || 'Browse all'}</a>
        </div>
      )}

      <TileRow title={`Most viewed ${parsed.topic}`} items={resolved.mostViewed} />
      <TileRow title="Shop by player type" items={resolved.playerType} placeholderLabels={parsed.playerTypeLabels} labelImages={labelImages} />
      <TileRow title="Shop by brand" items={resolved.brand} placeholderLabels={parsed.brandLabels} labelImages={labelImages} />

      {parsed.faqs.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, textAlign: 'center' }}>{parsed.topic} &mdash; your questions answered</h2>
          {parsed.faqs.map((f, i) => (
            <details key={i} style={{ borderBottom: '1px solid #e3e0d6', padding: '0.7rem 0' }}>
              <summary style={{ fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>{f.q}</summary>
              <p style={{ color: '#5b6259', marginTop: '0.5rem', fontSize: '0.9rem' }}>{f.a}</p>
              {f.ctaUrl && <a href={f.ctaUrl} onClick={e => e.preventDefault()} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#20842e' }}>{f.ctaText || 'Learn more'} &rarr;</a>}
            </details>
          ))}
        </div>
      )}

      <TileRow title="Shop by model" items={resolved.model} placeholderLabels={parsed.modelLabels} labelImages={labelImages} />
      <TileRow title="Featured collections" items={resolved.featured} placeholderLabels={parsed.featuredLabels} labelImages={labelImages} />

      {parsed.buyingGuideSections.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, textAlign: 'center' }}>{parsed.buyingGuideHeading}</h2>
          {parsed.buyingGuideSections.map((s, i) => (
            <div key={i} style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0d3d1f' }}>{s.heading}</h3>
              {s.paragraphs.map((p, j) => <p key={j} style={{ color: '#5b6259', marginTop: '0.6rem' }}>{p}</p>)}
            </div>
          ))}
        </div>
      )}

      {parsed.clubhouseUrl && (
        <div style={{ marginTop: '2rem', background: '#005f2c', color: '#fff', padding: '2rem', borderRadius: 8 }}>
          <h2 style={{ margin: 0 }}>Go to the clubhouse</h2>
          <p style={{ opacity: 0.92, marginTop: '0.8rem' }}>{parsed.clubhouseBody}</p>
          <a href={parsed.clubhouseUrl} onClick={e => e.preventDefault()} style={{ display: 'inline-block', marginTop: '1rem', background: '#fff', color: '#005f2c', fontWeight: 700, padding: '0.7rem 1.3rem', borderRadius: 6, textDecoration: 'none' }}>Read our {parsed.topic} guides</a>
        </div>
      )}

      {parsed.footerLinks.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem 1.4rem', marginTop: '2rem' }}>
          {parsed.footerLinks.map((l, i) => <a key={i} href={l.url} onClick={e => e.preventDefault()} style={{ fontSize: '0.85rem', fontWeight: 700, color: '#5b6259', textDecoration: 'underline' }}>{l.label}</a>)}
        </div>
      )}
    </div>
  )
}

export default function ClpTemplate() {
  const [docText, setDocText] = useState('')
  const [parsed, setParsed] = useState(EMPTY)
  const [status, setStatus] = useState('')
  const [targetHandle, setTargetHandle] = useState('marketing-automation-test-page')
  const [pushState, setPushState] = useState('idle')
  const [pushError, setPushError] = useState(null)
  const [originalContent, setOriginalContent] = useState(null)
  const [wasCreated, setWasCreated] = useState(false)
  const [resolved, setResolved] = useState({ mostViewed: [], playerType: [], brand: [], model: [], featured: [] })
  const [labelImages, setLabelImages] = useState({})
  const [previewLoading, setPreviewLoading] = useState(false)
  const [docUrl, setDocUrl] = useState('')
  const [docLoading, setDocLoading] = useState(false)
  const [docLoadError, setDocLoadError] = useState(null)
  const isProtectedHandle = !SAFE_TEST_HANDLES.includes(targetHandle.trim())

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
    } catch (err) {
      setDocLoadError(err.message)
    } finally {
      setDocLoading(false)
    }
  }

  async function handleParse() {
    const next = parseClpDoc(docText)
    setParsed(next)
    setStatus('Loaded ' + new Date().toLocaleTimeString())
    setPushState('idle')
    setPushError(null)
    setOriginalContent(null)
    setWasCreated(false)
    if (next.handle) setTargetHandle(next.handle)
    setPreviewLoading(true)
    try {
      const [main, other] = await Promise.all([
        fetch('/api/marketing/resolve-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mainCategoryUrls: next.mostViewedUrls, otherCategoryUrls: next.playerTypeUrls }),
        }).then(r => r.json()),
        fetch('/api/marketing/resolve-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mainCategoryUrls: next.brandUrls, otherCategoryUrls: next.modelUrls }),
        }).then(r => r.json()),
      ])
      const featuredRes = await fetch('/api/marketing/resolve-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainCategoryUrls: next.featuredUrls, otherCategoryUrls: [] }),
      }).then(r => r.json())
      setResolved({
        mostViewed: main.main || [], playerType: main.other || [],
        brand: other.main || [], model: other.other || [],
        featured: featuredRes.main || [],
      })

      // Best-guess images for placeholder tiles (names the doc has but no
      // real link yet) — visual polish only, never used for the real link.
      const allLabels = [
        ...next.playerTypeLabels, ...next.brandLabels, ...next.modelLabels, ...next.featuredLabels,
      ]
      if (allLabels.length) {
        fetch('/api/marketing/resolve-label-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labels: allLabels }),
        }).then(r => r.json()).then(d => setLabelImages(d.images || {})).catch(() => {})
      } else {
        setLabelImages({})
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
    const sure = window.confirm(
      isProtectedHandle
        ? `"${targetHandle.trim()}" isn't the usual test handle — this looks like a real, live page.\n\nIt'll be visible on:\nhttps://www.golfclubs4cash.co.uk/pages/${targetHandle}\n\nContinue?`
        : `This writes to the page's metafields and assigns the shared CLP template.\n\nIt'll be visible on:\nhttps://www.golfclubs4cash.co.uk/pages/${targetHandle}\n\nContinue?`
    )
    if (!sure) return
    setPushState('pushing')
    setPushError(null)
    try {
      const res = await fetch('/api/marketing/clp-push-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: targetHandle.trim(), confirmHandle: targetHandle.trim(),
          pageTitle: parsed.pageTitle, metaDescription: parsed.metaDescription,
          topic: parsed.topic, h1: parsed.h1, intro: parsed.introParagraphs.join(' '),
          trustSignals: parsed.trustSignals,
          browseAllLabel: parsed.browseAllLabel, browseAllUrl: parsed.browseAllUrl,
          mostViewedUrls: parsed.mostViewedUrls, playerTypeUrls: parsed.playerTypeUrls,
          brandUrls: parsed.brandUrls, modelUrls: parsed.modelUrls, featuredUrls: parsed.featuredUrls,
          faqs: parsed.faqs,
          buyingGuideHeading: parsed.buyingGuideHeading, buyingGuideSections: parsed.buyingGuideSections,
          clubhouseBody: parsed.clubhouseBody, clubhouseUrl: parsed.clubhouseUrl,
          footerLinks: parsed.footerLinks,
        }),
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
        : `This restores the page to what it looked like before your last push.\n\nContinue?`
    )
    if (!sure) return
    setPushState('reverting')
    setPushError(null)
    try {
      const res = await fetch('/api/marketing/clp-revert-live', {
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
      <div className="page-title">CLP Template</div>
      <div className="page-sub">
        Category Landing Pages (Drivers, Irons, Putters, etc.) — hero with trust signals, 5 tile-grid sections (Most Viewed, Player Type,
        Brand, Model, Featured Collections), FAQs, a buying guide, the Clubhouse CTA, and footer links. Matches Murray's real CLP example doc order.
      </div>

      <MarketingHistoryList
        title="CLPs done so far"
        listEndpoint="/api/marketing/clp-list"
        resetEndpoint="/api/marketing/clp-reset"
        seoEndpoint="/api/marketing/clp-seo"
        baseUrl="https://www.golfclubs4cash.co.uk/pages/"
        onUseHandle={(handle) => setTargetHandle(handle)}
      />

      <div className="settings-section">
        <h3 className="settings-section-title">1. Paste the copy doc</h3>
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
        <textarea
          className="form-input"
          style={{ width: '100%', minHeight: 220, fontFamily: 'monospace', fontSize: 12.5 }}
          placeholder="...or paste the full CLP doc text here"
          value={docText}
          onChange={e => setDocText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <button className="btn btn-primary" onClick={handleParse} disabled={!docText.trim()}>Show preview</button>
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
            <button className="btn btn-primary" style={{ background: '#c0392b' }} onClick={handlePushLive} disabled={pushState === 'pushing' || !targetHandle.trim()}>
              {pushState === 'pushing' ? 'Pushing…' : 'Push live'}
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={handleRevert} disabled={pushState === 'reverting'}>
              {pushState === 'reverting' ? 'Reverting…' : wasCreated ? 'Revert (delete)' : 'Revert (undo)'}
            </button>
          )}
          {pushState === 'live' && <span style={{ fontSize: 12.5, color: '#1a7a2e', fontWeight: 600 }}>Live now.</span>}
          {pushState === 'error' && <span style={{ fontSize: 12.5, color: '#c0392b' }}>{pushError}</span>}
        </div>
      </div>

      {status && (
        <div className="settings-section" style={{ padding: 0, overflow: 'hidden' }}>
          <h3 className="settings-section-title" style={{ padding: '14px 18px 0' }}>Live preview (renders the real design — no Shopify writes)</h3>
          <ClpPreview parsed={parsed} resolved={resolved} labelImages={labelImages} />
        </div>
      )}

      <div className="settings-section">
        <h3 className="settings-section-title">Parsed fields</h3>
        {[
          ['Handle', parsed.handle],
          ['Topic', parsed.topic],
          ['H1', parsed.h1],
          ['Most viewed', parsed.mostViewedUrls.length],
          ['Player type', parsed.playerTypeUrls.length],
          ['Brand', parsed.brandUrls.length],
          ['Model', parsed.modelUrls.length],
          ['Featured', parsed.featuredUrls.length],
          ['FAQs', parsed.faqs.length],
          ['Buying guide sections', parsed.buyingGuideSections.length],
          ['Footer links', parsed.footerLinks.length],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}>
            <span style={{ color: '#888' }}>{label}</span><span>{value || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
