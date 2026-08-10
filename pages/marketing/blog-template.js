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

function getField(text, label) {
  const m = text.match(new RegExp('^' + label + ':\\s*(.*)$', 'm'))
  return m ? m[1].trim() : ''
}

function parseBlogDoc(text) {
  const suggestedMatch = text.match(/^Suggested URL:\s*\n?(https?:\/\/\S+)/m)
  const suggestedUrl = suggestedMatch ? suggestedMatch[1] : ''
  const urlParts = suggestedUrl.replace(/\?$/, '').split('/blogs/')[1] || ''
  const [blogHandle, articleHandleRaw] = urlParts.split('/')
  const articleHandle = (articleHandleRaw || '').split('?')[0]

  const pageTitle = getField(text, 'Page Title')
  const metaDescription = getField(text, 'Meta Description')
  const excerpt = getField(text, 'Excerpt')
  const tagsRaw = getField(text, 'Tags')
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []
  const featuredImageHint = getField(text, 'Featured image')

  // Body starts after the metadata block — first line that isn't one of
  // the known label lines and isn't blank.
  const metaLabels = /^(Suggested URL|Page Title|Meta Description|Excerpt|Tags|Featured image|Images|Links)/
  const lines = text.split('\n').map(l => l.trim())
  let bodyStart = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] && !metaLabels.test(lines[i]) && !/^https?:\/\//.test(lines[i])) {
      bodyStart = i
      break
    }
  }
  const bodyLines = lines.slice(bodyStart).filter(Boolean)

  const h1 = bodyLines[0] || pageTitle
  const introParagraphs = []
  const sections = []
  let current = null
  for (const line of bodyLines.slice(1)) {
    // Heuristic: a heading is a short line with no sentence-ending
    // punctuation; everything else is body prose belonging to whichever
    // section (or the intro, before the first heading) came before it.
    const isHeading = line.length < 80 && !/[.!?]$/.test(line) && !/^(CTA LINK|Q\??\s*[-:])/i.test(line)
    if (isHeading) {
      current = { heading: line, paragraphs: [] }
      sections.push(current)
    } else if (current) {
      current.paragraphs.push(line)
    } else {
      introParagraphs.push(line)
    }
  }

  return {
    blogHandle: blogHandle || '', articleHandle: articleHandle || '',
    pageTitle, metaDescription, excerpt, tags, featuredImageHint,
    h1, introParagraphs, sections,
  }
}

const EMPTY = {
  blogHandle: '', articleHandle: '', pageTitle: '', metaDescription: '', excerpt: '', tags: [],
  featuredImageHint: '', h1: '', introParagraphs: [], sections: [],
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
        .gc4c-post .gc4c-lede { font-size: 1.1rem; line-height: 1.75; color: #3f4640; }
        .gc4c-post .gc4c-section { margin-top: 2.8rem; padding-top: 2.2rem; border-top: 1px solid #e3e0d6; }
        .gc4c-post .gc4c-section:first-of-type { margin-top: 2rem; }
        .gc4c-post h2 { font-size: 1.45rem; font-weight: 700; color: #0d3d1f; margin: 0 0 1.1rem; letter-spacing: -0.01em; text-align: center; }
        .gc4c-post .gc4c-img-frame { max-width: 400px; margin: 0 auto 1.5rem; border-radius: 14px; overflow: hidden; border: 1px solid #e3e0d6; background: #f6f4ef; box-shadow: 0 8px 24px rgba(13,61,31,0.08); }
        .gc4c-post .gc4c-img-frame img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
        .gc4c-post p { font-size: 1rem; line-height: 1.75; color: #333; margin-top: 1rem; }
        .gc4c-post p a, .gc4c-post .gc4c-lede a { color: #20842e; font-weight: 700; text-decoration: underline; }
      `}</style>
      <h1>{parsed.h1}</h1>
      <div className="gc4c-post">
        {parsed.introParagraphs.map((p, i) => (
          <p key={i} className={i === 0 ? 'gc4c-lede' : ''} dangerouslySetInnerHTML={{ __html: p }} />
        ))}
        {parsed.sections.map((s, i) => (
          <div key={i} className="gc4c-section">
            <h2>{s.heading}</h2>
            {(resolved.sectionImages || [])[i] && (
              <div className="gc4c-img-frame"><img src={resolved.sectionImages[i]} alt={s.heading} /></div>
            )}
            {s.paragraphs.map((p, j) => <p key={j} dangerouslySetInnerHTML={{ __html: p }} />)}
          </div>
        ))}
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
  const [resolved, setResolved] = useState({ sectionImages: [], featuredImageUrl: null })
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
    const next = parseBlogDoc(docText)
    setParsed(next)
    setStatus('Loaded ' + new Date().toLocaleTimeString())
    setPushState('idle')
    setPushError(null)
    setOriginalContent(null)
    if (next.blogHandle) setTargetBlogHandle(next.blogHandle)
    if (next.articleHandle) setTargetHandle(next.articleHandle)
    setPreviewLoading(true)
    try {
      const queries = next.sections.map(s => s.heading)
      const res = await fetch('/api/marketing/blog-resolve-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [...queries, next.featuredImageHint] }),
      })
      const data = await res.json()
      if (res.ok) {
        const images = data.images || []
        setResolved({ sectionImages: images.slice(0, queries.length), featuredImageUrl: images[queries.length] || null })
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
    const sure = window.confirm(
      isProtectedHandle
        ? `"${targetHandle.trim()}" isn't the usual test handle — this looks like a real, live article.\n\nIt'll be visible on:\nhttps://www.golfclubs4cash.co.uk/blogs/${targetBlogHandle}/${targetHandle}\n\nContinue?`
        : `This creates/updates the article and assigns the shared blog template.\n\nIt'll be visible on:\nhttps://www.golfclubs4cash.co.uk/blogs/${targetBlogHandle}/${targetHandle}\n\nContinue?`
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
          introParagraphs: parsed.introParagraphs,
          sections: parsed.sections,
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
