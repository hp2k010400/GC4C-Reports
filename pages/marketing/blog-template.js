import { useState } from 'react'
import MarketingHistoryList from '../../components/MarketingHistoryList'

// Mirrors lib/marketing-safety.js.
const SAFE_TEST_HANDLES = ['marketing-automation-test-page', 'marketing-automation-test', 'marketing-automation-test-article']

// Real doc format (from the actual Odyssey vs TaylorMade Spider doc) — much
// simpler than Brand Hub docs, a straightforward long-form article:
//   Suggested URL:
//   https://www.golfclubs4cash.co.uk/blogs/<blog>/<article>
//   Page Title: ...
//   Meta Description: ...
//   Excerpt: ...
//   Tags: comma, separated
//   Featured image: <description of what image to use>
//   Images: <description>
//   Links: <instructional note — actual links come from inline hyperlinks
//           in the body text, already woven in as <a> tags upstream>
//
//   <H1 line>
//   <intro paragraph(s)>
//   <H2-style heading line>
//   <paragraph(s)>
//   <H2-style heading line>
//   <paragraph(s)>
//   ...

// label may be a single string or an array of synonyms to try in order —
// agency-produced docs don't always use Murray's exact wording (e.g. "Meta
// title" instead of "Page Title").
function getField(text, label) {
  const labels = Array.isArray(label) ? label : [label]
  for (const l of labels) {
    const m = text.match(new RegExp('^' + l + ':\\s*(.*)$', 'im'))
    if (m) return m[1].trim()
  }
  return ''
}

const META_LABEL_RE = /^(Suggested URL|Page Title|Meta [Tt]itle|Meta [Dd]escription|Excerpt|Tags|Featured image|Images|Links):/i

// tables: pre-extracted real <table> data from the doc's HTML export (see
// fetch-google-doc.js), in document order — [[ [cell,...], ... ], ...].
// Google's plain-text export renders every table cell as its own line,
// tab-prefixed except the very first cell in the whole table, with no other
// structural marker — column count varies per table, so it can't be
// reconstructed from the plain text alone. Instead, a run of consecutive
// tab-prefixed lines is treated as "a table happened here" and matched to
// the next unused entry in `tables`, in the same order both exports share.
function parseBlogDoc(text, tables = []) {
  const suggestedMatch = text.match(/^Suggested URL:\s*\n?(https?:\/\/\S+)/im)
  const suggestedUrl = suggestedMatch ? suggestedMatch[1] : ''
  const urlParts = suggestedUrl.replace(/\?$/, '').split('/blogs/')[1] || ''
  const [blogHandle, articleHandleRaw] = urlParts.split('/')
  const articleHandle = (articleHandleRaw || '').split('?')[0]

  const pageTitle = getField(text, ['Page Title', 'Meta title'])
  const metaDescription = getField(text, ['Meta Description', 'Meta description'])
  const excerpt = getField(text, 'Excerpt')
  const tagsRaw = getField(text, 'Tags')
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []
  const featuredImageHint = getField(text, 'Featured image')

  // Google Docs' plain-text export litters paragraph breaks with lone
  // zero-width-space characters (U+200B) as their own "line" — invisible,
  // but not blank, so they'd otherwise slip past a blank-line filter and,
  // being short with no ending punctuation, get misread as headings (one
  // doc alone had 24 of these, each becoming a bogus one-character section).
  const ZWSP_CHARS = [0x200b, 0x200c, 0x200d, 0xfeff].map(c => String.fromCharCode(c)).join('')
  const ZWSP_RE = new RegExp('[' + ZWSP_CHARS + ']', 'g')
  const rawLines = text.split('\n').map(l => l.replace(ZWSP_RE, ''))
  const trimmedLines = rawLines.map(l => l.trim())

  // Body starts right after the LAST recognized metadata field — not "the
  // first line that isn't a label", since some docs (agency-produced ones
  // especially) have a title/label block above the metadata (e.g.
  // "GOLFCLUBS4CASH / THE FINAL ROUND / ONSITE COPY") that isn't real page
  // content and would otherwise get mistaken for the H1.
  let bodyStart = -1
  for (let i = 0; i < trimmedLines.length; i++) {
    if (META_LABEL_RE.test(trimmedLines[i])) bodyStart = i + 1
  }
  if (bodyStart === -1) {
    // No metadata fields recognized at all — fall back to the old
    // heuristic (first non-blank, non-URL line).
    bodyStart = 0
    for (let i = 0; i < trimmedLines.length; i++) {
      if (trimmedLines[i] && !/^https?:\/\//.test(trimmedLines[i])) { bodyStart = i; break }
    }
  }

  // Keep raw-vs-trimmed in lockstep while dropping blanks, so table
  // detection (which needs the untrimmed leading tab) still lines up.
  const bodyLines = []
  for (let i = bodyStart; i < trimmedLines.length; i++) {
    if (trimmedLines[i]) bodyLines.push({ text: trimmedLines[i], tabbed: rawLines[i].startsWith('\t') })
  }

  // Explicit "H1:" prefix takes priority; falls back to just using the
  // first body line for docs that don't label it.
  const h1Match = bodyLines[0] && bodyLines[0].text.match(/^H1:\s*(.+)$/i)
  const h1 = h1Match ? h1Match[1].trim() : (bodyLines[0]?.text || pageTitle)
  // Optional "Subtext:" line right after the H1 — a subtitle, not body prose.
  let restStart = 1
  let subtitle = ''
  const subtextMatch = bodyLines[1] && bodyLines[1].text.match(/^Subtext:\s*(.+)$/i)
  if (subtextMatch) { subtitle = subtextMatch[1].trim(); restStart = 2 }

  const introParagraphs = []
  const sections = []
  const sources = []
  let current = null
  let inSources = false
  let nextTableIndex = 0
  const rest = bodyLines.slice(restStart)
  for (let i = 0; i < rest.length; i++) {
    const { text: rawLine, tabbed } = rest[i]

    if (tabbed) continue // consumed as part of the table run below, on its first line

    // A run of tab-prefixed lines right after this one = a table happened
    // here. Consume the whole run and attach the next real table by order.
    if (i + 1 < rest.length && rest[i + 1].tabbed) {
      let j = i + 1
      while (j < rest.length && rest[j].tabbed) j++
      const table = tables[nextTableIndex]
      nextTableIndex++
      if (table && current) (current.tables || (current.tables = [])).push(table)
      i = j - 1
      continue
    }

    if (/^(Sources|Additional sources):?$/i.test(rawLine)) { inSources = true; continue }
    if (inSources) {
      // Numbered citation lines ("1. England Golf (July 2026)") — strip the
      // leading number, keep the rest.
      const cited = rawLine.replace(/^\d+\.\s*/, '')
      if (cited) sources.push(cited)
      continue
    }

    // Explicit "H2:"/"H3:" prefix takes priority; falls back to the old
    // heuristic (short line, no ending punctuation = heading, level 2) for
    // docs that don't use explicit H-labels. A trailing colon is excluded
    // from the fallback specifically — that's the shape of a sentence
    // introducing a table or list ("The 10 popular locations...:"), not a
    // real heading, and would otherwise strand the table that follows in
    // a spurious section of its own instead of the real one it belongs to.
    const hMatch = rawLine.match(/^H([23]):\s*(.+)$/i)
    const isHeading = hMatch
      ? true
      : rawLine.length < 80 && !/[.!?:]$/.test(rawLine) && !/^(CTA LINK|Q\??\s*[-:])/i.test(rawLine)
    if (isHeading) {
      current = { heading: hMatch ? hMatch[2].trim() : rawLine, level: hMatch ? Number(hMatch[1]) : 2, paragraphs: [] }
      sections.push(current)
    } else if (current) {
      current.paragraphs.push(rawLine)
    } else {
      introParagraphs.push(rawLine)
    }
  }

  return {
    blogHandle: blogHandle || '', articleHandle: articleHandle || '',
    pageTitle, metaDescription, excerpt, tags, featuredImageHint,
    h1, subtitle, introParagraphs, sections, sources,
  }
}

const EMPTY = {
  blogHandle: '', articleHandle: '', pageTitle: '', metaDescription: '', excerpt: '', tags: [],
  featuredImageHint: '', h1: '', subtitle: '', introParagraphs: [], sections: [], sources: [],
}

function extractInlineLinks(section, text) {
  if (!text) return []
  const found = []
  for (const m of text.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)) {
    found.push({ section, text: m[2], url: m[1] })
  }
  return found
}

function BlogPreview({ parsed, resolved }) {
  return (
    <div className="blog-preview">
      <style jsx>{`
        @font-face {
          font-family: 'Open Sans Condensed Preview';
          src: url('https://www.golfclubs4cash.co.uk/cdn/fonts/open_sans_condensed/opensanscondensed_n4.b735817c3758cc70fda491bc4590427f285556cd.woff2') format('woff2');
          font-weight: 400; font-style: normal; font-display: swap;
        }
        @font-face {
          font-family: 'Open Sans Condensed Preview';
          src: url('https://www.golfclubs4cash.co.uk/cdn/fonts/open_sans_condensed/opensanscondensed_n7.540ad984d87539ff9a03e07d9527f1ec85e214bc.woff2') format('woff2');
          font-weight: 700; font-style: normal; font-display: swap;
        }
        .blog-preview { font-family: 'Open Sans Condensed Preview', -apple-system, sans-serif; background: #fff; color: #1c1f1a; max-width: 700px; margin: 0 auto; padding: 2.4rem 1.75rem; }
        .blog-preview h1 { font-size: clamp(1.8rem, 3.4vw, 2.3rem); font-weight: 700; margin: 0 0 1.5rem; text-align: center; }
        .gc4c-post .gc4c-subtitle { font-size: 1.15rem; color: #5b6259; text-align: center; margin: -1rem 0 1.5rem; font-style: italic; }
        .gc4c-post .gc4c-hero { max-width: 100%; margin: 0 0 2rem; border-radius: 14px; overflow: hidden; border: 1px solid #e3e0d6; box-shadow: 0 8px 24px rgba(13,61,31,0.08); }
        .gc4c-post .gc4c-hero img { width: 100%; display: block; }
        .gc4c-post .gc4c-lede { font-size: 1.1rem; line-height: 1.75; color: #3f4640; }
        .gc4c-post .gc4c-section { margin-top: 2.8rem; padding-top: 2.2rem; border-top: 1px solid #e3e0d6; }
        .gc4c-post .gc4c-section:first-of-type { margin-top: 2rem; }
        .gc4c-post h2 { font-size: 1.45rem; font-weight: 700; color: #0d3d1f; margin: 0 0 1.1rem; letter-spacing: -0.01em; text-align: center; }
        .gc4c-post h3 { font-size: 1.2rem; font-weight: 700; color: #0d3d1f; margin: 1.8rem 0 0.9rem; letter-spacing: -0.01em; }
        .gc4c-post .gc4c-img-frame { max-width: 400px; margin: 0 auto 1.5rem; border-radius: 14px; overflow: hidden; border: 1px solid #e3e0d6; background: #f6f4ef; box-shadow: 0 8px 24px rgba(13,61,31,0.08); }
        .gc4c-post .gc4c-img-frame img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
        .gc4c-post p { font-size: 1rem; line-height: 1.75; color: #333; margin-top: 1rem; }
        .gc4c-post p a, .gc4c-post .gc4c-lede a { color: #20842e; font-weight: 700; text-decoration: underline; }
        .gc4c-post .gc4c-table-wrap { margin-top: 1.4rem; overflow-x: auto; border: 1px solid #e3e0d6; border-radius: 10px; }
        .gc4c-post table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
        .gc4c-post table th { background: #f6f4ef; color: #0d3d1f; font-weight: 700; text-align: left; padding: 0.65rem 0.9rem; border-bottom: 2px solid #e3e0d6; }
        .gc4c-post table td { padding: 0.6rem 0.9rem; border-bottom: 1px solid #e3e0d6; }
        .gc4c-post table tr:last-child td { border-bottom: none; }
        .gc4c-post .gc4c-sources { margin-top: 2.8rem; padding-top: 1.4rem; border-top: 1px solid #e3e0d6; font-size: 0.85rem; color: #5b6259; }
        .gc4c-post .gc4c-sources ol { margin: 0; padding-left: 1.2rem; }
      `}</style>
      <h1>{parsed.h1}</h1>
      <div className="gc4c-post">
        {resolved.heroImage && <div className="gc4c-hero"><img src={resolved.heroImage} alt="" /></div>}
        {parsed.subtitle && <p className="gc4c-subtitle">{parsed.subtitle}</p>}
        {parsed.introParagraphs.map((p, i) => (
          <p key={i} className={i === 0 ? 'gc4c-lede' : ''} dangerouslySetInnerHTML={{ __html: p }} />
        ))}
        {parsed.sections.map((s, i) => {
          const Tag = s.level === 3 ? 'h3' : 'h2'
          return (
            <div key={i} className="gc4c-section">
              <Tag>{s.heading}</Tag>
              {(resolved.sectionImages || [])[i] && (
                <div className="gc4c-img-frame"><img src={resolved.sectionImages[i]} alt={s.heading} /></div>
              )}
              {s.paragraphs.map((p, j) => <p key={j} dangerouslySetInnerHTML={{ __html: p }} />)}
              {(s.tables || []).map((table, t) => (
                <div key={t} className="gc4c-table-wrap">
                  <table>
                    <thead><tr>{table[0].map((c, k) => <th key={k}>{c}</th>)}</tr></thead>
                    <tbody>
                      {table.slice(1).map((row, r) => (
                        <tr key={r}>{row.map((c, k) => <td key={k}>{c}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )
        })}
        {parsed.sources && parsed.sources.length > 0 && (
          <div className="gc4c-sources">
            <h3>Sources</h3>
            <ol>{parsed.sources.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </div>
        )}
      </div>
    </div>
  )
}

export default function BlogTemplate() {
  const [docText, setDocText] = useState('')
  const [parsed, setParsed] = useState(EMPTY)
  const [status, setStatus] = useState('')
  const [targetBlogHandle, setTargetBlogHandle] = useState('marketing-automation-test-blog')
  const [targetHandle, setTargetHandle] = useState('marketing-automation-test-article')
  const [pushState, setPushState] = useState('idle')
  const [pushError, setPushError] = useState(null)
  const [originalContent, setOriginalContent] = useState(null)
  const [wasCreated, setWasCreated] = useState(false)
  const [resolved, setResolved] = useState({ sectionImages: [], featuredImageUrl: null, heroImage: null })
  const [previewLoading, setPreviewLoading] = useState(false)
  const [docUrl, setDocUrl] = useState('')
  const [docLoading, setDocLoading] = useState(false)
  const [docLoadError, setDocLoadError] = useState(null)
  const [docTables, setDocTables] = useState([])
  const [docImages, setDocImages] = useState([])
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
      setDocTables(data.tables || [])
      setDocImages(data.images || [])
    } catch (err) {
      setDocLoadError(err.message)
    } finally {
      setDocLoading(false)
    }
  }

  async function handleParse() {
    const next = parseBlogDoc(docText, docTables)
    setParsed(next)
    setStatus('Loaded ' + new Date().toLocaleTimeString())
    setPushState('idle')
    setPushError(null)
    setOriginalContent(null)
    if (next.blogHandle) setTargetBlogHandle(next.blogHandle)
    if (next.articleHandle) setTargetHandle(next.articleHandle)
    setPreviewLoading(true)
    try {
      // "The Final Round" (Murray's extreme-weather PR piece) has three real
      // infographics embedded directly in the source doc, already uploaded
      // to Shopify Files — none of its content is "about" a product, so
      // searching Shopify by heading text (which was matching country names
      // like "Scotland" to a Scotland-flag towel) makes no sense anywhere in
      // this article. One-off wiring, not a generic feature — placements
      // confirmed directly against the real doc's own layout, not guessed.
      const isFinalRound = next.h1 === 'The Final Round'
      const byHeading = isFinalRound ? {
        'How extreme weather is impacting golf in the UK':
          'https://cdn.shopify.com/s/files/1/0559/0450/1875/files/extreme-weather-golf-uk-map-banner.jpg?v=1786621757',
        'The UK locations to experience the most disruption':
          'https://cdn.shopify.com/s/files/1/0559/0450/1875/files/extreme-weather-golf-uk-regions.jpg?v=1786621731',
        'Where is extreme weather forecast to impact golfers the most in the future':
          'https://cdn.shopify.com/s/files/1/0559/0450/1875/files/extreme-weather-golf-2040-forecast.jpg?v=1786621734',
      } : {}

      // Sections that already came with real embedded data (a table) or a
      // known real image have no sensible product-photo match.
      const queries = isFinalRound ? [] : next.sections.map(s => (s.tables?.length ? null : s.heading)).filter(Boolean)
      const res = await fetch('/api/marketing/blog-resolve-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [...queries, next.featuredImageHint] }),
      })
      const data = await res.json()
      if (res.ok) {
        const images = data.images || []
        let qi = 0
        const sectionImages = next.sections.map(s => (s.tables?.length || isFinalRound ? null : images[qi++]))
        next.sections.forEach((s, i) => {
          if (byHeading[s.heading]) sectionImages[i] = byHeading[s.heading]
        })
        setResolved({ sectionImages, featuredImageUrl: isFinalRound ? null : (images[queries.length] || null) })
      }
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handlePushLive() {
    if (!targetBlogHandle.trim() || !targetHandle.trim()) return
    // Guards against publishing an empty article: if the doc box was never
    // parsed in this session (or got reset), pushing would otherwise silently
    // go live with the article titled by its raw handle and no real body.
    if (!parsed.h1 && !parsed.pageTitle) {
      setPushState('error')
      setPushError('Nothing parsed yet — paste the doc and click "Show preview" first, then push. (Pushing now would publish an empty article.)')
      return
    }
    // Checked live, right before the confirm — catches a handle typo/mismatch
    // before it happens. Shopify doesn't error on a colliding handle, it
    // silently appends "-1" and creates an orphaned duplicate instead of
    // updating the article actually meant.
    let check = { exists: false }
    try {
      const checkRes = await fetch(`/api/marketing/check-article?handle=${encodeURIComponent(targetHandle.trim())}`)
      check = await checkRes.json()
    } catch {
      // If the check itself fails, fall through to the push's own real
      // create-or-update logic rather than blocking on a lookup failure.
    }
    const statusLine = check.exists
      ? `Found an existing article: "${check.title}".\nThis will UPDATE that article.`
      : `⚠️ No article currently exists at this handle.\nThis will CREATE A NEW article — if you expected this to update an existing one, stop and check the handle matches the real live URL exactly.`
    const sure = window.confirm(
      isProtectedHandle
        ? `"${targetHandle.trim()}" isn't the usual test handle — this looks like a real, live article.\n\n${statusLine}\n\nIt'll be visible on:\nhttps://www.golfclubs4cash.co.uk/blogs/${targetBlogHandle}/${targetHandle}\n\nContinue?`
        : `${statusLine}\n\nIt'll be visible on:\nhttps://www.golfclubs4cash.co.uk/blogs/${targetBlogHandle}/${targetHandle}\n\nContinue?`
    )
    if (!sure) return
    setPushState('pushing')
    setPushError(null)
    try {
      const res = await fetch('/api/marketing/blog-push-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogHandle: targetBlogHandle.trim(),
          handle: targetHandle.trim(),
          confirmHandle: targetHandle.trim(),
          title: parsed.pageTitle || parsed.h1,
          metaDescription: parsed.metaDescription,
          excerpt: parsed.excerpt,
          tags: parsed.tags,
          h1: parsed.h1,
          subtitle: parsed.subtitle,
          heroImage: resolved.heroImage,
          introParagraphs: parsed.introParagraphs,
          sections: parsed.sections,
          sources: parsed.sources,
          featuredImageHint: parsed.featuredImageHint,
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
        ? `This article didn't exist before your last push — reverting deletes it entirely.\n\nContinue?`
        : `This restores the article to what it looked like before your last push.\n\nContinue?`
    )
    if (!sure) return
    setPushState('reverting')
    setPushError(null)
    try {
      const res = await fetch('/api/marketing/blog-revert-live', {
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

  function buildLinkMap() {
    const links = []
    parsed.introParagraphs.forEach(p => links.push(...extractInlineLinks('Intro', p)))
    parsed.sections.forEach(s => s.paragraphs.forEach(p => links.push(...extractInlineLinks(s.heading, p))))
    return links
  }

  return (
    <div className="container">
      <div className="page-title">Blog Post Template</div>
      <div className="page-sub">
        One shared template for blog posts — long-form article layout (H1, intro, H2 sections each with a real product photo). Linking works
        entirely through hyperlinks embedded in the doc's copy itself, not a separate CTA/URL list.
      </div>

      <MarketingHistoryList
        title="Blog posts done so far"
        listEndpoint="/api/marketing/blog-list"
        resetEndpoint="/api/marketing/blog-reset"
        seoEndpoint="/api/marketing/blog-seo"
        baseUrl="https://www.golfclubs4cash.co.uk/blogs/"
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
          placeholder="...or paste the full blog post doc text here"
          value={docText}
          onChange={e => setDocText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <button className="btn btn-primary" onClick={handleParse} disabled={!docText.trim()}>Show preview</button>
          {status && <span style={{ fontSize: 12, color: '#888' }}>{status}{previewLoading ? ' — resolving product images…' : ''}</span>}
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #ddd' }}>
          <label className="settings-label" style={{ display: 'block', marginBottom: 6 }}>Test blog / article to push to (its own dedicated, unlinked URL)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="form-input" style={{ width: 260 }} value={targetBlogHandle} onChange={e => { setTargetBlogHandle(e.target.value); setPushError(null); if (pushState === 'error') setPushState('idle') }} placeholder="blog handle" />
            <span style={{ color: '#888' }}>/</span>
            <input className="form-input" style={{ width: 260 }} value={targetHandle} onChange={e => { setTargetHandle(e.target.value); setPushError(null); if (pushState === 'error') setPushState('idle') }} placeholder="article handle" />
            <a className="btn btn-secondary" href={`https://www.golfclubs4cash.co.uk/blogs/${targetBlogHandle}/${targetHandle}`} target="_blank" rel="noopener noreferrer">View page</a>
          </div>
          {isProtectedHandle && targetHandle.trim() && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#c0392b' }}>
              "{targetHandle.trim()}" isn't the usual test handle — this looks like a real, live article.
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {pushState !== 'live' ? (
            <button className="btn btn-primary" style={{ background: '#c0392b' }} onClick={handlePushLive} disabled={pushState === 'pushing' || !targetBlogHandle.trim() || !targetHandle.trim()}>
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
          <BlogPreview parsed={parsed} resolved={resolved} />
        </div>
      )}

      {status && (
        <div className="settings-section">
          <h3 className="settings-section-title">Link map — every inline link in this doc, and where it goes</h3>
          {(() => {
            const links = buildLinkMap()
            if (links.length === 0) return <div style={{ fontSize: 13, color: '#888' }}>No inline links found in this doc yet.</div>
            const bySection = {}
            for (const l of links) {
              if (!bySection[l.section]) bySection[l.section] = []
              bySection[l.section].push(l)
            }
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
          ['Blog handle', parsed.blogHandle],
          ['Article handle', parsed.articleHandle],
          ['Page title', parsed.pageTitle],
          ['H1', parsed.h1],
          ['Intro paragraphs', parsed.introParagraphs.length],
          ['Sections', parsed.sections.length],
          ['Tags', parsed.tags.join(', ')],
          ['Featured image hint', parsed.featuredImageHint],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}>
            <span style={{ color: '#888' }}>{label}</span><span>{value || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
