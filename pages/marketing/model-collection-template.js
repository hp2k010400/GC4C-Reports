import { useState } from 'react'
import MarketingHistoryList from '../../components/MarketingHistoryList'

// Mirrors lib/marketing-safety.js — pushing to anything outside this list
// requires typing the handle out to confirm, not just clicking a dialog.
const SAFE_TEST_HANDLES = ['marketing-automation-test-page', 'marketing-automation-test']

const SECTION_HEADERS = [
  'Header & Footer Text',
  'Collection Description Copy',
  'Player Type Copy',
  'Other Clubs or Brands',
  'Generic Trade-In Copy',
  'Why Choose Us Copy',
  'FAQs Required',
  'Guides & Help Required',
]
const LABEL_FIELDS = ['Suggested URL', 'Page Title', 'Meta Description', 'Featured image', 'Alt Text']

function parseDoc(text) {
  const lines = text.split(/\r?\n/)
  const labels = {}
  const sections = {}
  let i = 0

  for (; i < lines.length; i++) {
    const line = lines[i].trim()
    if (SECTION_HEADERS.some(h => line === h)) break
    const m = line.match(/^([A-Za-z &]+):\s*(.*)$/)
    if (m && LABEL_FIELDS.includes(m[1].trim())) {
      let val = m[2].trim()
      if (!val) {
        let j = i + 1
        while (j < lines.length && !lines[j].trim()) j++
        val = (lines[j] || '').trim()
        i = j
      }
      labels[m[1].trim()] = val
    }
  }

  let currentHeader = null
  let buffer = []
  for (; i < lines.length; i++) {
    const line = lines[i].trim()
    if (SECTION_HEADERS.includes(line)) {
      if (currentHeader) sections[currentHeader] = buffer.join('\n').trim()
      currentHeader = line
      buffer = []
    } else if (/^_{3,}$/.test(line)) {
      // Doc-format divider (a horizontal rule in Google Docs exports as underscores) —
      // treat as the end of whatever section we're in, so "before/after comparison"
      // scaffolding after it doesn't bleed into the real copy.
      if (currentHeader) sections[currentHeader] = buffer.join('\n').trim()
      currentHeader = null
      buffer = []
    } else if (currentHeader) {
      buffer.push(lines[i])
    }
  }
  if (currentHeader) sections[currentHeader] = buffer.join('\n').trim()
  return { labels, sections }
}

function parseFaqs(sectionText) {
  const lines = (sectionText || '').split('\n').map(l => l.trim()).filter(Boolean)
  const faqs = []
  let current = null
  for (const line of lines) {
    if (line.endsWith('?')) {
      if (current) faqs.push(current)
      current = { q: line, a: '' }
    } else if (current) {
      current.a = (current.a ? current.a + ' ' : '') + line
    }
  }
  if (current) faqs.push(current)
  return faqs
}

function handleFromUrl(url) {
  const parts = (url || '').split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

function firstParagraphsOf(sectionText) {
  const lines = (sectionText || '').split('\n').map(l => l.trim()).filter(Boolean)
  return { title: lines[0] || '', body: lines.slice(1).join(' ') }
}

const EMPTY_PARSED = {
  handle: '', pageTitle: '', metaDescription: '',
  title: '', intro: '', faqs: [],
  collectionDescription: '', playerType: '', otherBrands: '', tradeIn: '', whyChooseUs: '', guides: '',
}

export default function ModelCollectionTemplate() {
  const [tab, setTab] = useState('preview')
  const [docText, setDocText] = useState('')
  const [parsed, setParsed] = useState(EMPTY_PARSED)
  const [image, setImage] = useState(null)
  const [imageError, setImageError] = useState(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const [status, setStatus] = useState('')
  const [pushState, setPushState] = useState('idle') // idle | pushing | live | reverting | error
  const [pushError, setPushError] = useState(null)
  const [originalContent, setOriginalContent] = useState(null)
  const [targetHandle, setTargetHandle] = useState('marketing-automation-test')
  const isProtectedHandle = !SAFE_TEST_HANDLES.includes(targetHandle.trim())

  async function handleParse() {
    const { labels, sections } = parseDoc(docText)
    const handle = handleFromUrl(labels['Suggested URL'])
    const { title, body } = firstParagraphsOf(sections['Header & Footer Text'])
    const faqs = parseFaqs(sections['FAQs Required'])

    setParsed({
      handle,
      pageTitle: labels['Page Title'] || '',
      metaDescription: labels['Meta Description'] || '',
      title,
      intro: body,
      faqs,
      collectionDescription: sections['Collection Description Copy'] || '',
      playerType: sections['Player Type Copy'] || '',
      otherBrands: sections['Other Clubs or Brands'] || '',
      tradeIn: sections['Generic Trade-In Copy'] || '',
      whyChooseUs: sections['Why Choose Us Copy'] || '',
      guides: sections['Guides & Help Required'] || '',
    })
    setStatus('Loaded ' + new Date().toLocaleTimeString())

    if (handle) {
      setLoadingImage(true)
      setImageError(null)
      try {
        const res = await fetch(`/api/marketing/lookup-image?handle=${encodeURIComponent(handle)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setImage(data)
      } catch (err) {
        setImage(null)
        setImageError(err.message)
      } finally {
        setLoadingImage(false)
      }
    } else {
      setImage(null)
      setImageError('No "Suggested URL" found in the doc, so there\'s no handle to look an image up for.')
    }
  }

  async function handlePushLive() {
    if (!targetHandle.trim()) return
    // Guards against publishing a blank description: if the doc box was never
    // parsed in this session (or got reset), pushing would otherwise silently
    // wipe a real collection's description to empty.
    if (!parsed.title && !parsed.pageTitle) {
      setPushState('error')
      setPushError('Nothing parsed yet — paste the doc and click "Show preview" first, then push. (Pushing now would blank the collection description.)')
      return
    }
    const sure = window.confirm(
      isProtectedHandle
        ? `"${targetHandle.trim()}" isn't the usual test handle — this looks like a real, live collection.\n\nThis writes to the description field only — the grid, filters and breadcrumbs are untouched.\n\nIt'll be visible on:\nhttps://www.golfclubs4cash.co.uk/collections/${targetHandle}\n\nContinue?`
        : `This writes to the description field only — the grid, filters and breadcrumbs are untouched.\n\nIt'll be visible on:\nhttps://www.golfclubs4cash.co.uk/collections/${targetHandle}\n\nContinue?`
    )
    if (!sure) return
    setPushState('pushing')
    setPushError(null)
    try {
      const res = await fetch('/api/marketing/push-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: targetHandle.trim(),
          confirmHandle: targetHandle.trim(),
          title: parsed.title,
          intro: parsed.intro,
          faqs: parsed.faqs.map(f => [f.q, f.a]),
          pageTitle: parsed.pageTitle,
          metaDescription: parsed.metaDescription,
          collectionDescription: parsed.collectionDescription,
          playerType: parsed.playerType,
          otherBrands: parsed.otherBrands,
          tradeIn: parsed.tradeIn,
          whyChooseUs: parsed.whyChooseUs,
          guides: parsed.guides,
          image: image?.image || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOriginalContent(data.original)
      setPushState('live')
    } catch (err) {
      setPushState('error')
      setPushError(err.message)
    }
  }

  async function handleRevert() {
    if (!targetHandle.trim() || !originalContent) return
    setPushState('reverting')
    setPushError(null)
    try {
      const res = await fetch('/api/marketing/revert-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: targetHandle.trim(), original: originalContent }),
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
      <div className="page-title">Model Collection Template</div>
      <div className="page-sub">
        CRO-informed template for the ~380 model collection pages (short copy above the grid, FAQ below — per Will&rsquo;s email).
        Paste a copy doc below to see it rendered live, with a real product image pulled from the live store.
      </div>

      <MarketingHistoryList
        title="Model collections done so far"
        listEndpoint="/api/marketing/model-collection-list"
        resetEndpoint="/api/marketing/model-collection-reset"
        baseUrl="https://www.golfclubs4cash.co.uk/collections/"
        onUseHandle={(handle) => setTargetHandle(handle)}
      />

      <div className="settings-section">
        <h3 className="settings-section-title">1. Paste the copy doc</h3>
        <textarea
          className="form-input"
          style={{ width: '100%', minHeight: 180, fontFamily: 'monospace', fontSize: 12.5 }}
          placeholder="Paste the doc's plain text here (Suggested URL, Page Title, Meta Description, Header & Footer Text, FAQs Required, etc.)"
          value={docText}
          onChange={e => setDocText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleParse} disabled={!docText.trim()}>Show preview</button>
          {status && <span style={{ fontSize: 12, color: '#888' }}>{status}</span>}
        </div>

        {parsed.handle && (
          <p style={{ fontSize: 12, color: '#aaa', marginTop: 14 }}>
            The doc itself points to <code>{parsed.handle}</code> &mdash; but pushes below always go to the test collection
            you set here, never that real page, unless you deliberately change it.
          </p>
        )}

        <div style={{ marginTop: 10, paddingTop: 14, borderTop: '1px dashed #ddd' }}>
          <label className="settings-label" style={{ display: 'block', marginBottom: 6 }}>Test collection to push to (its own dedicated, unlinked URL)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="form-input"
              style={{ width: 320 }}
              value={targetHandle}
              onChange={e => { setTargetHandle(e.target.value); setPushError(null); if (pushState === 'error') setPushState('idle') }}
            />
            <a
              className="btn btn-secondary"
              href={`https://www.golfclubs4cash.co.uk/collections/${targetHandle}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View page
            </a>
          </div>
          <p style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>
            Defaults to <code>marketing-automation-test</code> &mdash; a real collection created just for this, not linked in any menu or nav.
          </p>
          {isProtectedHandle && targetHandle.trim() && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#c0392b' }}>
              "{targetHandle.trim()}" isn't the usual test handle — this looks like a real, live collection.
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
            <button
              className="btn btn-secondary"
              onClick={handleRevert}
              disabled={pushState === 'reverting'}
            >
              {pushState === 'reverting' ? 'Reverting…' : 'Revert (undo)'}
            </button>
          )}
          {pushState === 'live' && (
            <span style={{ fontSize: 12.5, color: '#1a7a2e', fontWeight: 600 }}>
              Live on that test page now &mdash; click Revert when you&rsquo;re done showing Murray.
            </span>
          )}
          {pushState === 'error' && (
            <span style={{ fontSize: 12.5, color: '#c0392b' }}>{pushError}</span>
          )}
        </div>
      </div>

      <div className="settings-section" style={{ display: 'flex', gap: 8, padding: 12 }}>
        <button className={tab === 'preview' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('preview')}>Preview</button>
        <button className={tab === 'code' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('code')}>Liquid code</button>
      </div>

      {tab === 'preview'
        ? <Preview parsed={parsed} image={image} imageError={imageError} loadingImage={loadingImage} />
        : <CodePanel />}
    </div>
  )
}

function Preview({ parsed, image, imageError, loadingImage }) {
  const hasContent = parsed.title || parsed.intro || parsed.faqs.length > 0
  return (
    <div className="settings-section" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ background: '#f6f4ef', color: '#222', fontFamily: '"Open Sans Condensed","Arial Narrow",sans-serif' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '2.2rem 1.5rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#005F2C', marginBottom: 8 }}>
            {parsed.handle || 'paste-a-doc-above'}
          </div>
          <h1 style={{ fontSize: '2.1rem', fontWeight: 700, margin: 0 }}>
            {parsed.title || 'Title will appear here'}
          </h1>
          <p style={{ marginTop: 12, color: '#555', maxWidth: '62ch' }}>
            {parsed.intro || 'Paste a doc and hit Show preview — the intro copy from "Header & Footer Text" renders here.'}
          </p>
        </div>

        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1.5rem 1.5rem' }}>
          <div style={{ background: '#fff', border: '1px solid #e3e0d6', borderRadius: 6, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            {loadingImage && <span style={{ fontSize: 13, color: '#888' }}>Fetching real image from the live store…</span>}
            {!loadingImage && image?.image && (
              <>
                <img src={image.image} alt={image.productTitle} style={{ width: 90, height: 90, objectFit: 'contain', background: '#fafafa', borderRadius: 4 }} />
                <div>
                  <div style={{ fontSize: 12.5, color: '#888' }}>Real image, pulled live for handle <code>{parsed.handle}</code></div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{image.productTitle}</div>
                </div>
              </>
            )}
            {!loadingImage && !image?.image && (
              <span style={{ fontSize: 13, color: imageError ? '#c0392b' : '#aaa' }}>
                {imageError || 'Fast Simon grid renders here — no image lookup needed until a doc is parsed.'}
              </span>
            )}
          </div>
        </div>

        <div style={{ background: '#fff', borderTop: '1px solid #e3e0d6', padding: '2rem 1.5rem' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.3rem', marginBottom: 12 }}>
              {hasContent ? `Questions about ${parsed.title || 'this collection'}` : 'FAQs will appear here'}
            </h2>
            {parsed.faqs.map(({ q, a }) => (
              <details key={q} style={{ borderBottom: '1px solid #e3e0d6', padding: '0.8rem 0' }}>
                <summary style={{ fontWeight: 700, color: '#b5651d', textTransform: 'uppercase', cursor: 'pointer' }}>{q}</summary>
                <p style={{ color: '#666', marginTop: 8, maxWidth: '68ch' }}>{a}</p>
              </details>
            ))}
          </div>
        </div>

        <div style={{ padding: '1rem 1.5rem', fontSize: '0.78rem', color: '#888' }}>
          Page title: {parsed.pageTitle || '—'} &nbsp;|&nbsp; Meta description: {parsed.metaDescription || '—'}
        </div>
      </div>
    </div>
  )
}

const DESCRIPTION_EXAMPLE = `<p>{intro copy}</p>
<!--footer-text-->
<div class="model-seo-faq">
  <h2>Questions about {title}</h2>
  <details><summary>{question}</summary><p>{answer}</p></details>
  ...
</div>`

function CodePanel() {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">How Push live actually works</h3>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
        No new theme section, no template_suffix, nothing added to the theme at all. The live collection template
        already splits <code>collection.description</code> on a <code>&lt;!--footer-text--&gt;</code> marker —
        one part renders above the product grid, the other below it. Push live only writes to that one field,
        so the grid, filters, breadcrumbs and everything else on the page are untouched.
      </p>
      <pre style={{ background: '#0d1410', color: '#d7ecd9', padding: 16, borderRadius: 8, fontSize: 12.5, overflowX: 'auto', lineHeight: 1.6 }}>
        {DESCRIPTION_EXAMPLE}
      </pre>
      <p style={{ fontSize: 13, color: '#888', marginTop: 12 }}>
        Revert restores the collection&rsquo;s exact original description and SEO fields (captured the moment
        before Push live overwrites them) &mdash; a true undo, not just a blank page.
      </p>
    </div>
  )
}
